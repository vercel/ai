import type { LanguageModelV3FinishReason } from '@ai-sdk/provider';
import { generateText, streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

type FinishReason = LanguageModelV3FinishReason['unified'];

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

const unsafeFinishReasons = [
  'length',
  'error',
  'content-filter',
  'other',
] as const satisfies FinishReason[];

function createSideEffectTool(onExecute: () => void) {
  return tool({
    inputSchema: z.object({ value: z.string() }),
    execute: async () => {
      onExecute();
      return 'side effect completed';
    },
  });
}

async function runGenerateText({
  finishReason,
  input = '{"value":"test"}',
}: {
  finishReason: FinishReason;
  input?: string;
}) {
  let executionCount = 0;

  const result = await generateText({
    model: new MockLanguageModelV3({
      doGenerate: {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'generate-call',
            toolName: 'sideEffect',
            input,
          },
        ],
        finishReason: { unified: finishReason, raw: finishReason },
        usage,
        warnings: [],
      },
    }),
    prompt: 'Call the tool.',
    tools: {
      sideEffect: createSideEffectTool(() => executionCount++),
    },
  });

  return {
    executionCount,
    finishReason: result.finishReason,
    invalid: result.toolCalls[0]?.invalid,
  };
}

async function runStreamText({
  finishReason,
  input = '{"value":"test"}',
}: {
  finishReason: FinishReason;
  input?: string;
}) {
  let executionCount = 0;

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          {
            type: 'tool-call',
            toolCallId: 'stream-call',
            toolName: 'sideEffect',
            input,
          },
          {
            type: 'finish',
            finishReason: { unified: finishReason, raw: finishReason },
            usage,
          },
        ]),
      },
    }),
    prompt: 'Call the tool.',
    tools: {
      sideEffect: createSideEffectTool(() => executionCount++),
    },
  });

  await result.consumeStream();

  return {
    executionCount,
    finishReason: await result.finishReason,
    invalid: (await result.toolCalls)[0]?.invalid,
  };
}

async function main() {
  const unsafeResults = await Promise.all(
    unsafeFinishReasons.flatMap(finishReason => [
      runGenerateText({ finishReason }).then(result => ({
        api: 'generateText',
        requestedFinishReason: finishReason,
        ...result,
      })),
      runStreamText({ finishReason }).then(result => ({
        api: 'streamText',
        requestedFinishReason: finishReason,
        ...result,
      })),
    ]),
  );

  const controls = {
    generateStop: await runGenerateText({ finishReason: 'stop' }),
    streamStop: await runStreamText({ finishReason: 'stop' }),
    generateMalformed: await runGenerateText({
      finishReason: 'other',
      input: '{"value":',
    }),
    streamMalformed: await runStreamText({
      finishReason: 'other',
      input: '{"value":',
    }),
  };

  console.log(JSON.stringify({ unsafeResults, controls }, null, 2));

  if (
    controls.generateStop.executionCount !== 1 ||
    controls.streamStop.executionCount !== 1
  ) {
    throw new Error(
      'Control failure: valid tool calls ending in stop must run.',
    );
  }

  if (
    controls.generateMalformed.executionCount !== 0 ||
    controls.streamMalformed.executionCount !== 0 ||
    controls.generateMalformed.invalid !== true ||
    controls.streamMalformed.invalid !== true
  ) {
    throw new Error(
      'Control failure: malformed tool calls must be invalid and must not run.',
    );
  }

  const unsafeExecutions = unsafeResults.filter(
    result => result.executionCount !== 0,
  );

  if (unsafeExecutions.length > 0) {
    throw new Error(
      'Reproduced issue #19063: tools executed after unsafe finish reasons.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
