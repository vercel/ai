import { describe, expectTypeOf, it } from 'vitest';
import type { GoogleVertexImageModelOptions } from './google-vertex-image-model-options';

describe('GoogleVertexImageModelOptions', () => {
  it('exposes Gemini image options', () => {
    expectTypeOf<'imageConfig'>().toExtend<
      keyof GoogleVertexImageModelOptions
    >();
    expectTypeOf<'thinkingConfig'>().toExtend<
      keyof GoogleVertexImageModelOptions
    >();
  });

  it('does not expose unsupported image options', () => {
    expectTypeOf<'responseModalities'>().not.toExtend<
      keyof GoogleVertexImageModelOptions
    >();
    expectTypeOf<'negativePrompt'>().not.toExtend<
      keyof GoogleVertexImageModelOptions
    >();
    expectTypeOf<'addWatermark'>().not.toExtend<
      keyof GoogleVertexImageModelOptions
    >();
    expectTypeOf<'sampleImageSize'>().not.toExtend<
      keyof GoogleVertexImageModelOptions
    >();
    expectTypeOf<'edit'>().not.toExtend<keyof GoogleVertexImageModelOptions>();
  });
});
