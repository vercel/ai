import { generateImage, NoImageGeneratedError } from 'ai';
import { MockImageModelV4 } from 'ai/test';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

async function main() {
  let callCount = 0;

  try {
    const result = await generateImage({
      model: new MockImageModelV4({
        doGenerate: async () => {
          callCount += 1;
          const images = callCount === 1 ? [] : [pngBase64];

          return {
            images,
            warnings: [],
            providerMetadata: {
              mock: {
                images: images.map(() => null),
              },
            },
            response: {
              timestamp: new Date(0),
              modelId: 'mock-model-id',
              headers: {},
            },
          };
        },
      }),
      prompt: 'sunny day at the beach',
      maxRetries: 2,
    });

    if (callCount !== 2 || result.images.length !== 1) {
      throw new Error(
        `Expected a retry followed by one image, received ${callCount} call(s) and ${result.images.length} image(s).`,
      );
    }
  } catch (error) {
    if (callCount === 1 && NoImageGeneratedError.isInstance(error)) {
      throw new Error(
        'ISSUE #20156 REPRODUCED: generateImage rejected the first empty result after 1 provider call instead of retrying the successful second response',
      );
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
