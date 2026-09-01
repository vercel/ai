import {
  toUIMessageChunk,
  WorkflowAgent,
  type ModelCallStreamPart,
} from '@ai-sdk/workflow';
import { tool, type ToolSet } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { z } from 'zod';

const reproducedSignal =
  'REPRODUCED issue #20070: WorkflowAgent exposed a thrown tool error as tool-result/tool-output-available.';

const usage = {
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
};

type StreamedToolPart = {
  type: 'tool-result' | 'tool-error';
  toolCallId: string;
  output?: unknown;
  error?: unknown;
};

async function runToolScenario({
  toolName,
  execute,
}: {
  toolName: string;
  execute: () => Promise<string>;
}) {
  const toolCallId = `${toolName}-call`;
  const streamedParts: ModelCallStreamPart<ToolSet>[] = [];
  let modelPromptAfterTool: unknown;
  let callCount = 0;

  const model = new MockLanguageModelV4({
    doStream: async options => {
      if (callCount++ === 0) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            {
              type: 'tool-call' as const,
              toolCallId,
              toolName,
              input: '{}',
            },
            {
              type: 'finish' as const,
              finishReason: {
                unified: 'tool-calls' as const,
                raw: 'tool-calls',
              },
              usage,
            },
          ]),
        };
      }

      modelPromptAfterTool = options.prompt;
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: 'text-1' },
          { type: 'text-delta' as const, id: 'text-1', delta: 'recovered' },
          { type: 'text-end' as const, id: 'text-1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  });

  const agent = new WorkflowAgent({
    model,
    tools: {
      [toolName]: tool({
        inputSchema: z.object({}),
        execute,
      }),
    },
  });

  await agent.stream({
    prompt: `Call ${toolName}.`,
    writable: new WritableStream({
      write(part) {
        streamedParts.push(part);
      },
    }),
  });

  const toolPart = streamedParts.find(
    (part): part is ModelCallStreamPart<ToolSet> & StreamedToolPart =>
      (part.type === 'tool-result' || part.type === 'tool-error') &&
      part.toolCallId === toolCallId,
  );

  if (toolPart == null) {
    throw new Error(`No public tool output part was emitted for ${toolName}.`);
  }

  return {
    modelPromptAfterTool,
    toolPart,
    uiPart: toUIMessageChunk(toolPart),
  };
}

function modelReceivedErrorText(prompt: unknown): boolean {
  if (!Array.isArray(prompt)) {
    return false;
  }

  return prompt.some(
    message =>
      typeof message === 'object' &&
      message != null &&
      'role' in message &&
      message.role === 'tool' &&
      'content' in message &&
      Array.isArray(message.content) &&
      message.content.some(
        (part: unknown) =>
          typeof part === 'object' &&
          part != null &&
          'type' in part &&
          part.type === 'tool-result' &&
          'output' in part &&
          typeof part.output === 'object' &&
          part.output != null &&
          'type' in part.output &&
          part.output.type === 'error-text' &&
          'value' in part.output &&
          part.output.value === 'Error: boom',
      ),
  );
}

async function main() {
  const thrown = await runToolScenario({
    toolName: 'explode',
    execute: async () => {
      throw new Error('boom');
    },
  });
  const successfulString = await runToolScenario({
    toolName: 'returnErrorString',
    execute: async () => 'Error: boom',
  });

  console.log(
    JSON.stringify(
      {
        thrown: {
          publicPart: thrown.toolPart,
          uiPart: thrown.uiPart,
          modelReceivedErrorText: modelReceivedErrorText(
            thrown.modelPromptAfterTool,
          ),
        },
        successfulString: {
          publicPart: successfulString.toolPart,
          uiPart: successfulString.uiPart,
        },
      },
      null,
      2,
    ),
  );

  if (!modelReceivedErrorText(thrown.modelPromptAfterTool)) {
    throw new Error(
      'The thrown tool error was not provided to the model as error-text.',
    );
  }

  if (
    successfulString.toolPart.type !== 'tool-result' ||
    successfulString.toolPart.output !== 'Error: boom' ||
    successfulString.uiPart?.type !== 'tool-output-available'
  ) {
    throw new Error(
      'The successful string control scenario did not produce a successful tool output.',
    );
  }

  if (
    thrown.toolPart.type === 'tool-error' &&
    thrown.uiPart?.type === 'tool-output-error'
  ) {
    console.log(
      'Issue #20070 is fixed: the thrown tool error is distinguishable from a successful string result.',
    );
    return;
  }

  if (
    thrown.toolPart.type === 'tool-result' &&
    thrown.toolPart.output === 'Error: boom' &&
    thrown.uiPart?.type === 'tool-output-available'
  ) {
    console.error(reproducedSignal);
    process.exitCode = 1;
    return;
  }

  throw new Error(
    `Unexpected thrown-tool representation: ${JSON.stringify({
      publicPart: thrown.toolPart,
      uiPart: thrown.uiPart,
    })}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
