import { describe, expectTypeOf, it } from 'vitest';
import type { JSONObject } from '@ai-sdk/provider';
import type { Experimental_GeneratedImage, GeneratedFile } from './index';

describe('Experimental_GeneratedImage', () => {
  it('should remain compatible with GeneratedFile', () => {
    expectTypeOf<Experimental_GeneratedImage>().toEqualTypeOf<GeneratedFile>();
  });

  it('should support provider metadata', () => {
    expectTypeOf<GeneratedFile['providerMetadata']>().toEqualTypeOf<
      Record<string, JSONObject> | undefined
    >();
  });
});
