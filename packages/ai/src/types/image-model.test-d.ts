import type { ImageModelV4 } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';

describe('ImageModelV4', () => {
  it('exposes optional image editing capabilities', () => {
    expectTypeOf<ImageModelV4['supportsFileInputs']>().toEqualTypeOf<
      PromiseLike<boolean> | boolean | undefined
    >();
    expectTypeOf<ImageModelV4['supportsMaskInputs']>().toEqualTypeOf<
      PromiseLike<boolean> | boolean | undefined
    >();
  });

  it('remains compatible with models that do not advertise capabilities', () => {
    const model: ImageModelV4 = {
      specificationVersion: 'v4' as const,
      provider: 'provider',
      modelId: 'model',
      maxImagesPerCall: 1,
      doGenerate: () =>
        Promise.resolve({
          images: [],
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: 'model',
            headers: undefined,
          },
        }),
    };

    expectTypeOf(model).toEqualTypeOf<ImageModelV4>();
  });
});
