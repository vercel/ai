import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { streamTextWithMinimalRetention } from '../stream-text-with-minimal-retention';

// Runs in an isolated Node process with --expose-gc. Generate independent flat
// strings lazily so the provider itself neither shares nor retains the output.
export async function checkMemoryRetention() {
  const mib = 1024 * 1024;
  const totalBytes = 128 * mib;
  const chunkBytes = 16 * 1024;
  let emittedBytes = 0;
  const model: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'test',
    modelId: 'test',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('Not implemented');
    },
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'text' });
        },
        pull(controller) {
          if (emittedBytes === totalBytes) {
            controller.enqueue({ type: 'text-end', id: 'text' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: {
                  total: 0,
                  noCache: 0,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: undefined,
                  text: undefined,
                  reasoning: undefined,
                },
              },
            });
            controller.close();
            return;
          }
          emittedBytes += chunkBytes;
          controller.enqueue({
            type: 'text-delta',
            id: 'text',
            delta: randomBytes(chunkBytes / 2).toString('hex'),
          });
        },
      }),
    }),
  };

  assert.ok(globalThis.gc);
  const result = streamTextWithMinimalRetention({ model, prompt: 'test' });
  const stream = result.textStream;
  globalThis.gc();
  const baseline = process.memoryUsage().heapUsed;
  let consumedBytes = 0;
  let peakGrowth = 0;

  async function checkHeap() {
    await setImmediate();
    globalThis.gc!();
    const growth = process.memoryUsage().heapUsed - baseline;
    peakGrowth = Math.max(peakGrowth, growth);
    // Leave ample room for runtime overhead, but not for retained output.
    assert.ok(
      growth < 16 * mib,
      `Retained ${growth / mib} MiB after ${consumedBytes / mib} MiB of output`,
    );
  }

  for await (const delta of stream) {
    consumedBytes += delta.length;
    if (consumedBytes % (32 * mib) === 0) await checkHeap();
  }
  assert.equal(consumedBytes, totalBytes);
  await checkHeap();
  // Keep the stream reachable across the final collection.
  assert.equal(await result.finishReason, 'stop');
  console.log(
    `Consumed ${consumedBytes / mib} MiB; peak live heap growth: ${peakGrowth / mib} MiB`,
  );
}
