import type { ImageModelV3 } from '@ai-sdk/provider';
import { generateImage, NoImageGeneratedError } from 'ai';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

async function main() {
  let callCount = 0;

  const model: ImageModelV3 = {
    specificationVersion: 'v3',
    provider: 'issue-20156-mock-provider',
    modelId: 'issue-20156-mock-model',
    maxImagesPerCall: 1,
    async doGenerate() {
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
          timestamp: new Date('2026-09-03T00:00:00.000Z'),
          modelId: 'issue-20156-mock-model',
          headers: {},
        },
      };
    },
  };

  try {
    const result = await generateImage({
      model,
      prompt: 'sunny day at the beach',
      maxRetries: 2,
    });

    if (callCount !== 2 || result.images.length !== 1) {
      throw new Error(
        `Unexpected result: calls=${callCount}, images=${result.images.length}`,
      );
    }

    console.log(
      'Issue fixed: the empty result was retried and an image returned.',
    );
  } catch (error) {
    if (NoImageGeneratedError.isInstance(error) && callCount === 1) {
      console.error(
        'ISSUE_20156_REPRODUCED: generateImage rejected after one empty-result call instead of retrying and returning the second-call image.',
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
