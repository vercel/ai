import type {
  LanguageModelV4FinishReason,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { generateText, streamText, tool, type FinishReason } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage: LanguageModelV4Usage = {
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

const unsafeFinishReasons = [
  'length',
  'error',
  'content-filter',
  'other',
] as const satisfies readonly FinishReason[];

function finishReason(unified: FinishReason): LanguageModelV4FinishReason {
  return { unified, raw: unified };
}

async function observeGenerateExecution({
  reason,
  input = '{"value":"confirmed"}',
}: {
  reason: FinishReason;
  input?: string;
}) {
  let executions = 0;

  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: {
        content: [
          {
            type: 'tool-call',
            toolCallId: `generate-${reason}`,
            toolName: 'sideEffect',
            input,
          },
        ],
        finishReason: finishReason(reason),
        usage,
        warnings: [],
      },
    }),
    prompt: 'Call the side-effecting tool.',
    tools: {
      sideEffect: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async () => {
          executions++;
          return 'executed';
        },
      }),
    },
  });

  return {
    executions,
    invalid: result.toolCalls[0]?.invalid === true,
  };
}

async function observeStreamExecution({
  reason,
  input = '{"value":"confirmed"}',
}: {
  reason: FinishReason;
  input?: string;
}) {
  let executions = 0;

  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: `stream-${reason}`,
            toolName: 'sideEffect',
            input,
          },
          {
            type: 'finish',
            finishReason: finishReason(reason),
            usage,
          },
        ]),
      },
    }),
    prompt: 'Call the side-effecting tool.',
    tools: {
      sideEffect: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async () => {
          executions++;
          return 'executed';
        },
      }),
    },
  });

  let invalid = false;
  for await (const part of result.fullStream) {
    if (part.type === 'tool-call' && part.invalid) {
      invalid = true;
    }
  }

  return { executions, invalid };
}

async function main() {
  const generateStop = await observeGenerateExecution({ reason: 'stop' });
  const streamStop = await observeStreamExecution({ reason: 'stop' });

  if (generateStop.executions !== 1 || streamStop.executions !== 1) {
    throw new Error(
      `Control failed: valid stop tool calls should execute once; generate=${generateStop.executions}, stream=${streamStop.executions}`,
    );
  }

  const malformedInput = '{"value":';
  const generateMalformed = await observeGenerateExecution({
    reason: 'stop',
    input: malformedInput,
  });
  const streamMalformed = await observeStreamExecution({
    reason: 'stop',
    input: malformedInput,
  });

  if (
    generateMalformed.executions !== 0 ||
    streamMalformed.executions !== 0 ||
    !generateMalformed.invalid ||
    !streamMalformed.invalid
  ) {
    throw new Error(
      `Control failed: malformed tool calls should be invalid and unexecuted; generate=${JSON.stringify(generateMalformed)}, stream=${JSON.stringify(streamMalformed)}`,
    );
  }

  const generateUnsafeExecutions: string[] = [];
  const streamUnsafeExecutions: string[] = [];

  for (const reason of unsafeFinishReasons) {
    const generated = await observeGenerateExecution({ reason });
    if (generated.executions !== 0) {
      generateUnsafeExecutions.push(reason);
    }

    const streamed = await observeStreamExecution({ reason });
    if (streamed.executions !== 0) {
      streamUnsafeExecutions.push(reason);
    }
  }

  if (
    generateUnsafeExecutions.length > 0 ||
    streamUnsafeExecutions.length > 0
  ) {
    throw new Error(
      `ISSUE_19063_REPRODUCED: unsafe finish reasons executed tools; generateText=[${generateUnsafeExecutions.join(',')}], streamText=[${streamUnsafeExecutions.join(',')}]`,
    );
  }

  console.log(
    'PASS: generateText() and streamText() did not execute tools for unsafe finish reasons.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
