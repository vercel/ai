import { expectTypeOf } from 'vitest';
import {
  prepareQuiverAIImageReference,
  type QuiverAIImageModelOptions,
  type QuiverAIImageReference,
} from './index';

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
expectTypeOf<QuiverAIImageModelOptions['operation']>().toEqualTypeOf<
  'generate' | 'vectorize' | 'edit' | undefined
>();
expectTypeOf<QuiverAIImageModelOptions['referenceImages']>().toEqualTypeOf<
  QuiverAIImageReference[] | undefined
>();
expectTypeOf(
  prepareQuiverAIImageReference(new Uint8Array([1, 2, 3])),
).toEqualTypeOf<QuiverAIImageReference>();
