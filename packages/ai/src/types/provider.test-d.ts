import type { ProviderV3 } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import type { Provider } from './provider';

describe('Provider', () => {
  it('should accept ProviderV3 implementations without reranking models', () => {
    expectTypeOf<ProviderV3>().toMatchTypeOf<Provider>();
  });
});
