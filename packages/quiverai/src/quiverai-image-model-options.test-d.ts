import { describe, expectTypeOf, it } from 'vitest';
import {
  prepareQuiverAIImageReference,
  type QuiverAIImageModelOptions,
  type QuiverAIImageReference,
} from './index';

describe('QuiverAIImageModelOptions', () => {
  it('supports SVG animation as an image operation', () => {
    const options = {
      operation: 'animate',
    } satisfies QuiverAIImageModelOptions;

    expectTypeOf(options.operation).toEqualTypeOf<'animate'>();
  });

  it('supports SVG editing with references and settings', () => {
    const options = {
      operation: 'edit',
      referenceImages: [
        { url: 'https://example.com/reference.png' },
        { base64: 'aW1hZ2U=' },
      ],
      maxReviewSteps: 2,
      reasoningEffort: 'high',
      maxOutputTokens: 4096,
      orchestratorMaxOutputTokens: 2048,
      shallowMaxOutputTokens: 1024,
      temperature: 0.3,
    } satisfies QuiverAIImageModelOptions;

    expectTypeOf(options.operation).toEqualTypeOf<'edit'>();
    expectTypeOf<QuiverAIImageModelOptions['referenceImages']>().toEqualTypeOf<
      QuiverAIImageReference[] | undefined
    >();
    expectTypeOf(
      prepareQuiverAIImageReference,
    ).returns.toEqualTypeOf<QuiverAIImageReference>();
  });

  it('supports all image operations', () => {
    expectTypeOf<QuiverAIImageModelOptions['operation']>().toEqualTypeOf<
      'generate' | 'vectorize' | 'animate' | 'edit' | undefined
    >();
  });
});
