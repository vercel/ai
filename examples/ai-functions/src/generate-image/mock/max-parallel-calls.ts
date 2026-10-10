import { setTimeout as delay } from 'node:timers/promises';
import { generateImage } from 'ai';
import { MockImageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

run(async () => {
  let activeCalls = 0;
  let peakActiveCalls = 0;
  let totalCalls = 0;

  const result = await generateImage({
    model: new MockImageModelV4({
      maxImagesPerCall: 1,
      doGenerate: async () => {
        totalCalls++;
        activeCalls++;
        peakActiveCalls = Math.max(peakActiveCalls, activeCalls);

        try {
          await delay(25);

          return {
            images: [pngBase64],
            warnings: [],
            response: {
              timestamp: new Date(),
              modelId: 'mock-image-model',
              headers: {},
            },
          };
        } finally {
          activeCalls--;
        }
      },
    }),
    prompt: 'A lighthouse during a storm',
    n: 6,
    maxParallelCalls: 2,
  });

  console.log({
    images: result.images.length,
    totalCalls,
    peakActiveCalls,
  });

  if (result.images.length !== 6 || totalCalls !== 6 || peakActiveCalls > 2) {
    throw new Error('Image generation exceeded the configured concurrency.');
  }
});
