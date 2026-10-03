import { describe, expectTypeOf, it } from 'vitest';
import type {
  PerplexityLanguageModelId,
  PerplexityLanguageModelOptions,
} from './index';

describe('PerplexityLanguageModelOptions', () => {
  it('accepts documented provider options', () => {
    const options = {
      return_images: true,
      search_recency_filter: 'year',
      search_domain_filter: ['example.com'],
    } satisfies PerplexityLanguageModelOptions;

    expectTypeOf(options).toMatchTypeOf<PerplexityLanguageModelOptions>();
  });

  it('narrows search_recency_filter to documented values', () => {
    expectTypeOf<{
      search_recency_filter: 'decade';
    }>().not.toMatchTypeOf<PerplexityLanguageModelOptions>();
  });
});

describe('PerplexityLanguageModelId', () => {
  it('accepts documented model ids and arbitrary strings', () => {
    expectTypeOf<'sonar-pro'>().toMatchTypeOf<PerplexityLanguageModelId>();
    expectTypeOf<'custom-model'>().toMatchTypeOf<PerplexityLanguageModelId>();
  });
});
