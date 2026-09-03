import { NoImageGeneratedError } from '../../../../packages/ai/src/error/no-image-generated-error';
import { generateImage } from '../../../../packages/ai/src/generate-image/generate-image';
import { MockImageModelV2 } from '../../../../packages/ai/src/test/mock-image-model-v2';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

function createMockResponse(images: string[]) {
  return {
    images,
    warnings: [],
    providerMetadata: {
      mockProvider: {
        images: images.map(() => null),
      },
    },
    response: {
      timestamp: new Date('2026-09-03T00:00:00.000Z'),
      modelId: 'mock-model-id',
      headers: {},
    },
  };
}

async function main() {
  let callCount = 0;

  try {
    const result = await generateImage({
      model: new MockImageModelV2({
        doGenerate: async () => {
          callCount += 1;
          return createMockResponse(callCount === 1 ? [] : [pngBase64]);
        },
      }),
      prompt: 'sunny day at the beach',
      maxRetries: 2,
    });

    if (callCount !== 2 || result.images.length !== 1) {
      throw new Error(
        `Expected recovery with one image after 2 calls, received ${result.images.length} images after ${callCount} calls.`,
      );
    }
  } catch (error) {
    if (NoImageGeneratedError.isInstance(error) && callCount === 1) {
      console.error(
        'ISSUE_20156_REPRODUCED: maxRetries=2 did not retry an empty image result; generateImage rejected after 1 model call',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
