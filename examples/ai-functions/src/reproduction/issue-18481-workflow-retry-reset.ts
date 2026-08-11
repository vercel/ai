import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import {
  AbstractChat,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  readUIMessageStream,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type Experimental_LanguageModelStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
  tool,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import {
  createModelCallToUIChunkTransform,
  WorkflowAgent,
} from '../../../../packages/workflow/dist/index.js';
import { z } from 'zod';

const usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

class ReproductionChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;
  messages: UIMessage[];

  constructor(messages: UIMessage[]) {
    this.messages = messages;
  }

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => value;
}

class ReproductionChat extends AbstractChat<UIMessage> {
  constructor(init: ChatInit<UIMessage>) {
    super({
      ...init,
      state: new ReproductionChatState(init.messages ?? []),
    });
  }
}

function providerStream(
  parts: LanguageModelV4StreamPart[],
  error?: Error,
): ReadableStream<LanguageModelV4StreamPart> {
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < parts.length) {
        controller.enqueue(parts[index++]);
      } else if (error == null) {
        controller.close();
      } else {
        controller.error(error);
      }
    },
  });
}

async function collectLastMessage(
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessage> {
  let lastMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({ stream })) {
    lastMessage = message;
  }

  if (lastMessage == null) {
    throw new Error(
      'Reproduction stream did not produce an assistant message.',
    );
  }

  return lastMessage;
}

function getToolStates(message: UIMessage): string[] {
  return message.parts
    .filter(part => part.type.startsWith('tool-'))
    .map(part =>
      'state' in part ? (part.state ?? 'missing-state') : part.type,
    );
}

async function main() {
  const transform = createModelCallToUIChunkTransform();
  const lastMessagePromise = collectLastMessage(transform.readable);
  const writable = transform.writable as WritableStream<
    Experimental_LanguageModelStreamPart<ToolSet>
  >;

  let attempt = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      if (attempt++ === 0) {
        return {
          stream: providerStream(
            [
              { type: 'stream-start', warnings: [] },
              {
                type: 'response-metadata',
                id: 'response-failed',
                modelId: 'mock-model',
                timestamp: new Date(0),
              },
              {
                type: 'tool-input-start',
                id: 'call-stale',
                toolName: 'deleteFile',
              },
              {
                type: 'tool-input-delta',
                id: 'call-stale',
                delta: '{"path":"/tmp/workflow-sandbox/partial',
              },
            ],
            new Error('simulated connection loss'),
          ),
        };
      }

      return {
        stream: providerStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'response-metadata',
            id: 'response-retried',
            modelId: 'mock-model',
            timestamp: new Date(1),
          },
          {
            type: 'tool-input-start',
            id: 'call-retried',
            toolName: 'deleteFile',
          },
          {
            type: 'tool-input-delta',
            id: 'call-retried',
            delta: '{"path":"/tmp/workflow-sandbox/target.txt"}',
          },
          {
            type: 'tool-input-end',
            id: 'call-retried',
          },
          {
            type: 'tool-call',
            toolCallId: 'call-retried',
            toolName: 'deleteFile',
            input: '{"path":"/tmp/workflow-sandbox/target.txt"}',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
            usage,
          },
        ]),
      };
    },
  });

  const agent = new WorkflowAgent({
    model,
    tools: {
      deleteFile: tool({
        inputSchema: z.object({ path: z.string() }),
        needsApproval: true,
        execute: async ({ path }) => ({ deleted: path }),
      }),
    },
  });

  try {
    await agent.stream({
      messages: [{ role: 'user', content: 'Delete the target file.' }],
      writable,
      preventClose: true,
      sendFinish: false,
    });
  } catch {
    // The workflow runtime automatically retries this failed step while the
    // durable writable keeps the chunks already emitted by the first attempt.
  }

  await agent.stream({
    messages: [{ role: 'user', content: 'Delete the target file.' }],
    writable,
    preventClose: true,
    sendFinish: false,
  });

  const writer = writable.getWriter();
  await writer.close();

  const assistantMessage = await lastMessagePromise;
  const preApprovalToolStates = getToolStates(assistantMessage);

  const retriedApproval = assistantMessage.parts
    .filter(isToolUIPart)
    .find(
      part =>
        part.toolCallId === 'call-retried' &&
        part.state === 'approval-requested',
    )?.approval;

  if (retriedApproval == null) {
    throw new Error(
      'Reproduction precondition failed: retried tool approval ID was missing.',
    );
  }

  let submitCount = 0;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      submitCount++;
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.enqueue({
            type: 'tool-output-available',
            toolCallId: 'call-retried',
            output: { deleted: true },
          });
          controller.enqueue({ type: 'finish', finishReason: 'stop' });
          controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };

  const chat = new ReproductionChat({
    id: 'issue-18481',
    messages: [assistantMessage],
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  await chat.addToolApprovalResponse({
    id: retriedApproval.id,
    approved: true,
  });

  await new Promise(resolve => setTimeout(resolve, 50));

  const toolStates = getToolStates(chat.messages[0]);

  if (submitCount === 0) {
    if (
      preApprovalToolStates.join(',') !==
      ['input-streaming', 'approval-requested'].join(',')
    ) {
      throw new Error(
        `Reproduction precondition failed: expected the unfixed baseline to contain the failed and retried tool calls, received ${preApprovalToolStates.join(', ')}.`,
      );
    }

    throw new Error(
      `Reproduced issue #18481: approving the retried tool did not submit because the invalidated partial tool call remained in useChat state (tool states: ${toolStates.join(', ')}).`,
    );
  }

  if (submitCount !== 1) {
    throw new Error(
      `Expected approving the retried tool to submit exactly once, but it submitted ${submitCount} times.`,
    );
  }

  const retriedTool = chat.messages[0].parts
    .filter(isToolUIPart)
    .find(part => part.toolCallId === 'call-retried');

  if (retriedTool?.state !== 'output-available') {
    throw new Error(
      `Expected the retried tool to have output after submission, received ${retriedTool?.state ?? 'missing'}.`,
    );
  }

  console.log(
    'Issue #18481 is fixed: retry invalidation removed the stale partial tool call and approval submitted.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
