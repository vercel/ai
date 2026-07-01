import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import type { PerplexityLanguageModelOptions } from './index';

describe('PerplexityLanguageModelOptions', () => {
  it('accepts documented provider options and additional pass-through parameters', () => {
    const options = {
      return_images: true,
      search_recency_filter: 'year',
      search_domain_filter: ['example.com'],
    } satisfies PerplexityLanguageModelOptions;

    expectTypeOf(options).toMatchTypeOf<PerplexityLanguageModelOptions>();

    expectTypeOf<{
      perplexity: PerplexityLanguageModelOptions;
    }>().toMatchTypeOf<
      NonNullable<LanguageModelV4CallOptions['providerOptions']>
    >();
  });

  it('narrows search_recency_filter to documented values', () => {
    expectTypeOf<{
      search_recency_filter: 'decade';
    }>().not.toMatchTypeOf<PerplexityLanguageModelOptions>();
  });
});
