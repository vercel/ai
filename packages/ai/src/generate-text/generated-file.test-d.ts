import { describe, expectTypeOf, it } from 'vitest';
import type { Experimental_GeneratedImage, GeneratedFile } from './index';

describe('Experimental_GeneratedImage', () => {
  it('should remain compatible with GeneratedFile', () => {
    expectTypeOf<Experimental_GeneratedImage>().toEqualTypeOf<GeneratedFile>();
  });
});
