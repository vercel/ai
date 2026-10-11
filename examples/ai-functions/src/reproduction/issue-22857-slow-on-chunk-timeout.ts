import assert from 'node:assert/strict';
import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { streamText } from 'ai';

const chunkTimeoutMs = 50;
const callbackDelayMs = 150;
const expectedTextLength = 100;
const reproductionSignal =
  'ISSUE_22857_REPRODUCED: slow onChunk callback triggered a chunk timeout after the provider queued its complete response';

const model: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  supportedUrls: {},
  async doGenerate() {
    throw new Error('This reproduction only exercises streaming.');
  },
  async doStream() {
    return {
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'text' });

          for (let index = 0; index < expectedTextLength; index++) {
            controller.enqueue({
              type: 'text-delta',
              id: 'text',
              delta: 'x',
            });
          }

          controller.enqueue({ type: 'text-end', id: 'text' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: undefined,
                reasoning: undefined,
              },
            },
          });
          controller.close();
        },
      }),
    };
  },
};

type RunResult = {
  textLength?: number;
  error?: string;
  aborted: boolean;
  errors: string[];
};

async function run({ slowOnChunk }: { slowOnChunk: boolean }) {
  let delayedFirstTextDelta = false;
  let aborted = false;
  const errors: string[] = [];

  const result = streamText({
    model,
    prompt: 'test',
    timeout: { chunkMs: chunkTimeoutMs },
    onChunk: async ({ chunk }) => {
      if (
        slowOnChunk &&
        !delayedFirstTextDelta &&
        chunk.type === 'text-delta'
      ) {
        delayedFirstTextDelta = true;
        await new Promise(resolve => setTimeout(resolve, callbackDelayMs));
      }
    },
    onAbort: () => {
      aborted = true;
    },
    onError: ({ error }) => {
      errors.push(String(error));
    },
  });

  try {
    await result.consumeStream();
    return {
      textLength: (await result.text).length,
      aborted,
      errors,
    } satisfies RunResult;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
      aborted,
      errors,
    } satisfies RunResult;
  }
}

async function main() {
  const fast = await run({ slowOnChunk: false });
  const slow = await run({ slowOnChunk: true });

  console.log(JSON.stringify({ fast, slow }, null, 2));

  assert.deepEqual(fast, {
    textLength: expectedTextLength,
    aborted: false,
    errors: [],
  });

  const expectedTimeout = `TimeoutError: Chunk timeout of ${chunkTimeoutMs}ms exceeded`;
  if (slow.aborted && slow.error === expectedTimeout) {
    throw new Error(reproductionSignal);
  }

  assert.deepEqual(slow, {
    textLength: expectedTextLength,
    aborted: false,
    errors: [],
  });
}

await main();
