import {
  convertToModelMessages,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  readUIMessageStream,
  tool,
  type UIMessage,
} from 'ai';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import {
  createModelCallToUIChunkTransform,
  WorkflowAgent,
  type ModelCallStreamPart,
} from '../../../../packages/workflow/dist/index.js';

const failureSignal =
  'ISSUE_18271_REPRODUCED: executed sibling results are missing from the client stream and HITL auto-resume remains false';

type PauseKind = 'client-tool' | 'approval';

function createToolCallModel(pausedToolName: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          const chunks: LanguageModelV4StreamPart[] = [
            { type: 'stream-start', warnings: [] },
            {
              type: 'response-metadata',
              id: 'response-1',
              modelId: 'mock-model',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallId: 'server-call',
              toolName: 'serverTool',
              input: '{}',
            },
            {
              type: 'tool-call',
              toolCallId: 'paused-call',
              toolName: pausedToolName,
              input: '{"answer":"continue"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: undefined },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 1,
                  text: 1,
                  reasoning: undefined,
                },
              },
            },
          ];
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
    }),
  });
}

function findToolPart(message: UIMessage, toolCallId: string) {
  return message.parts.find(
    part => 'toolCallId' in part && part.toolCallId === toolCallId,
  ) as
    | (UIMessage['parts'][number] & {
        state: string;
        output?: unknown;
        approval?: {
          id: string;
          approved?: boolean;
        };
      })
    | undefined;
}

async function toFinalUIMessage(
  chunks: ModelCallStreamPart[],
): Promise<UIMessage> {
  const rawStream = new ReadableStream<ModelCallStreamPart>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  let finalMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: rawStream.pipeThrough(createModelCallToUIChunkTransform()),
  })) {
    finalMessage = message;
  }

  if (!finalMessage) {
    throw new Error('Reproduction setup failed: no UI message was produced');
  }

  return finalMessage;
}

async function runScenario(pauseKind: PauseKind) {
  let serverExecutionCount = 0;
  const pausedToolName =
    pauseKind === 'client-tool' ? 'clientTool' : 'approvalTool';

  const agent = new WorkflowAgent({
    model: createToolCallModel(pausedToolName),
    tools: {
      serverTool: tool({
        inputSchema: z.object({}),
        execute: async () => {
          serverExecutionCount++;
          return { status: 'executed' };
        },
      }),
      ...(pauseKind === 'client-tool'
        ? {
            clientTool: tool({
              inputSchema: z.object({ answer: z.string() }),
            }),
          }
        : {
            approvalTool: tool({
              inputSchema: z.object({ answer: z.string() }),
              needsApproval: true,
              execute: async () => ({ status: 'approved' }),
            }),
          }),
    },
  });

  const chunks: ModelCallStreamPart[] = [];
  const result = await agent.stream({
    messages: [{ role: 'user', content: 'Call both tools.' }],
    writable: new WritableStream<ModelCallStreamPart>({
      write(chunk) {
        chunks.push(structuredClone(chunk));
      },
    }),
  });

  if (
    serverExecutionCount !== 1 ||
    !result.toolResults.some(
      toolResult => toolResult.toolCallId === 'server-call',
    )
  ) {
    throw new Error(
      `Reproduction setup failed: the server sibling did not execute in the ${pauseKind} scenario`,
    );
  }

  const message = await toFinalUIMessage(chunks);
  const serverPart = findToolPart(message, 'server-call');
  const pausedPart = findToolPart(message, 'paused-call');

  if (!serverPart || !pausedPart) {
    throw new Error(
      `Reproduction setup failed: tool call chunks were not streamed in the ${pauseKind} scenario`,
    );
  }

  const resolvedMessage = structuredClone(message);
  const resolvedPausedPart = findToolPart(resolvedMessage, 'paused-call')!;

  let autoResume: boolean;
  let forcedResumeError: string | undefined;
  if (pauseKind === 'client-tool') {
    resolvedPausedPart.state = 'output-available';
    resolvedPausedPart.output = { answer: 'continue' };
    autoResume = lastAssistantMessageIsCompleteWithToolCalls({
      messages: [resolvedMessage],
    });

    try {
      await agent.stream({
        messages: await convertToModelMessages([resolvedMessage]),
      });
    } catch (error) {
      forcedResumeError =
        error instanceof Error ? error.message : String(error);
    }
  } else {
    if (!resolvedPausedPart.approval) {
      throw new Error(
        'Reproduction setup failed: approval request was not streamed',
      );
    }
    resolvedPausedPart.state = 'approval-responded';
    resolvedPausedPart.approval.approved = true;
    autoResume = lastAssistantMessageIsCompleteWithApprovalResponses({
      messages: [resolvedMessage],
    });
  }

  return {
    pauseKind,
    returnedServerResult: true,
    streamedServerState: serverPart.state,
    streamedServerResult: serverPart.state === 'output-available',
    pausedStateBeforeResponse: pausedPart.state,
    autoResumeAfterResponse: autoResume,
    forcedResumeError,
    serverExecutionCountAfterForcedResume: serverExecutionCount,
  };
}

async function main() {
  const scenarios = await Promise.all([
    runScenario('client-tool'),
    runScenario('approval'),
  ]);

  console.log(JSON.stringify(scenarios, null, 2));

  const reproduced = scenarios.every(
    scenario =>
      scenario.returnedServerResult &&
      !scenario.streamedServerResult &&
      scenario.streamedServerState === 'input-available' &&
      !scenario.autoResumeAfterResponse,
  );

  if (reproduced) {
    throw new Error(failureSignal);
  }

  console.log(
    'Issue #18271 was not reproduced: executed sibling results reached the client or HITL auto-resume succeeded.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
