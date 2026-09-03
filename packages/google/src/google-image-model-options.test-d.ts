import { describe, expectTypeOf, it } from 'vitest';
import type { GoogleImageModelOptions } from './google-image-model-options';

describe('GoogleImageModelOptions', () => {
  it('exposes Gemini image and search options', () => {
    expectTypeOf<'imageConfig'>().toExtend<keyof GoogleImageModelOptions>();
    expectTypeOf<'thinkingConfig'>().toExtend<keyof GoogleImageModelOptions>();
    expectTypeOf<'googleSearch'>().toExtend<keyof GoogleImageModelOptions>();
  });

  it('does not expose unsupported image options', () => {
    expectTypeOf<'responseModalities'>().not.toExtend<
      keyof GoogleImageModelOptions
    >();
    expectTypeOf<'personGeneration'>().not.toExtend<
      keyof GoogleImageModelOptions
    >();
    expectTypeOf<'aspectRatio'>().not.toExtend<keyof GoogleImageModelOptions>();
  });
});
