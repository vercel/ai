import type { ProviderV3, ProviderV4 } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import type { Provider } from './provider';

describe('Provider', () => {
  it('accepts providers with optional reranking model support', () => {
    expectTypeOf<ProviderV3>().toMatchTypeOf<Provider>();
    expectTypeOf<ProviderV4>().toMatchTypeOf<Provider>();
  });
});
