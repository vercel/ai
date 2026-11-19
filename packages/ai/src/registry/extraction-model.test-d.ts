import type { Experimental_ExtractionModelV4 as ExtractionModelV4 } from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { ExtractionMockModelV4 } from '../test/extraction-mock-model-v4';
import { MockProviderV4 } from '../test/mock-provider-v4';
import { customProvider } from './custom-provider';
import { createProviderRegistry } from './provider-registry';

it('types custom extraction aliases', () => {
  const provider = customProvider({
    extractionModels: {
      invoice: new ExtractionMockModelV4(),
      receipt: 'provider:receipt',
    },
  });
  expectTypeOf(
    provider.extractionModel('invoice'),
  ).toEqualTypeOf<ExtractionModelV4>();
  expectTypeOf(provider.extractionModel)
    .parameter(0)
    .toEqualTypeOf<'invoice' | 'receipt'>();
});

it('suggests provider extraction model ids in the registry', () => {
  const provider = Object.assign(new MockProviderV4(), {
    extractionModel: (_modelId: 'fast' | 'accurate' | (string & {})) =>
      new ExtractionMockModelV4(),
  });
  const registry = createProviderRegistry({ provider });
  expectTypeOf(
    registry.extractionModel('provider:fast'),
  ).toEqualTypeOf<ExtractionModelV4>();
  registry.extractionModel('provider:custom-model');
  // @ts-expect-error unknown provider
  registry.extractionModel('missing:fast');
});
