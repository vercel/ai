import {
  generateText,
  jsonSchema,
  simulateReadableStream,
  streamText,
  tool,
  type FinishReason,
} from '../../../../packages/ai/src/index';
import { MockLanguageModelV2 } from '../../../../packages/ai/src/test/mock-language-model-v2';

const unsafeFinishReasons = [
  'length',
  'error',
  'content-filter',
  'other',
] as const satisfies readonly FinishReason[];

const usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  reasoningTokens: undefined,
  cachedInputTokens: undefined,
};

const inputSchema = jsonSchema<{ value: string }>({
  type: 'object',
  properties: {
    value: { type: 'string' },
  },
  required: ['value'],
  additionalProperties: false,
});

async function runGenerateCase({
  finishReason,
  input = '{"value":"side effect"}',
}: {
  finishReason: FinishReason;
  input?: string;
}) {
  let executionCount = 0;

  const result = await generateText({
    model: new MockLanguageModelV2({
      doGenerate: {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'generate-call',
            toolName: 'sideEffect',
            input,
          },
        ],
        finishReason,
        usage,
        warnings: [],
      },
    }),
    prompt: 'Call the side-effecting tool.',
    tools: {
      sideEffect: tool({
        inputSchema,
        execute: async () => {
          executionCount++;
          return 'executed';
        },
      }),
    },
  });

  return {
    executionCount,
    finishReason: result.finishReason,
    invalid: result.toolCalls[0]?.invalid === true,
  };
}

async function runStreamCase({
  finishReason,
  input = '{"value":"side effect"}',
}: {
  finishReason: FinishReason;
  input?: string;
}) {
  let executionCount = 0;

  const result = streamText({
    model: new MockLanguageModelV2({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            {
              type: 'tool-call',
              toolCallId: 'stream-call',
              toolName: 'sideEffect',
              input,
            },
            {
              type: 'finish',
              finishReason,
              usage,
            },
          ],
        }),
      },
    }),
    prompt: 'Call the side-effecting tool.',
    tools: {
      sideEffect: tool({
        inputSchema,
        execute: async () => {
          executionCount++;
          return 'executed';
        },
      }),
    },
  });

  await result.consumeStream();
  const toolCalls = await result.toolCalls;

  return {
    executionCount,
    finishReason: await result.finishReason,
    invalid: toolCalls[0]?.invalid === true,
  };
}

function assertControl(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ISSUE_19063_CONTROL_FAILURE: ${message}`);
  }
}

async function main() {
  const safeGenerate = await runGenerateCase({ finishReason: 'stop' });
  const safeStream = await runStreamCase({ finishReason: 'stop' });
  assertControl(
    safeGenerate.executionCount === 1 && safeStream.executionCount === 1,
    'valid stop responses must execute once',
  );

  const malformedGenerate = await runGenerateCase({
    finishReason: 'tool-calls',
    input: '{',
  });
  const malformedStream = await runStreamCase({
    finishReason: 'tool-calls',
    input: '{',
  });
  assertControl(
    malformedGenerate.executionCount === 0 &&
      malformedGenerate.invalid &&
      malformedStream.executionCount === 0 &&
      malformedStream.invalid,
    'malformed tool JSON must be invalid and must not execute',
  );

  const unsafeResults = [];
  for (const finishReason of unsafeFinishReasons) {
    unsafeResults.push({
      api: 'generateText',
      ...(await runGenerateCase({ finishReason })),
    });
    unsafeResults.push({
      api: 'streamText',
      ...(await runStreamCase({ finishReason })),
    });
  }

  console.log(JSON.stringify(unsafeResults, null, 2));

  const unexpectedExecutions = unsafeResults.filter(
    result => result.executionCount !== 0,
  );

  if (unexpectedExecutions.length > 0) {
    const cases = unexpectedExecutions
      .map(result => `${result.api}:${result.finishReason}`)
      .join(', ');
    throw new Error(
      `ISSUE_19063_REPRODUCED: unsafe finish reasons executed tools: ${cases}`,
    );
  }

  console.log(
    'ISSUE_19063_NOT_REPRODUCED: unsafe finish reasons did not execute tools',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
