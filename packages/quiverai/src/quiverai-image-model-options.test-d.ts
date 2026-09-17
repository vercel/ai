import { describe, expectTypeOf, it } from 'vitest';
import type { QuiverAIImageModelOptions } from './quiverai-image-model-options';

describe('QuiverAIImageModelOptions', () => {
  it('supports SVG animation as an image operation', () => {
    const options = {
      operation: 'animate',
    } satisfies QuiverAIImageModelOptions;

    expectTypeOf(options.operation).toEqualTypeOf<'animate'>();
    expectTypeOf<QuiverAIImageModelOptions['operation']>().toEqualTypeOf<
      'generate' | 'vectorize' | 'animate' | undefined
    >();
  });
});
