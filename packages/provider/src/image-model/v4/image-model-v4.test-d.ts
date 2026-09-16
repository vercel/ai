import { expectTypeOf } from 'vitest';
import type { ImageModelV4 } from './image-model-v4';

expectTypeOf<NonNullable<ImageModelV4['maxImagesPerPrompt']>>().toEqualTypeOf<
  | number
  | ((options: {
      modelId: string;
      providerOptions: Parameters<
        ImageModelV4['doGenerate']
      >[0]['providerOptions'];
    }) => PromiseLike<number | undefined> | number | undefined)
>();
