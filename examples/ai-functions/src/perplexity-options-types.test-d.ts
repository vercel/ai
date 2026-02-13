import type { PerplexityLanguageModelOptions } from '@ai-sdk/perplexity';
import { describe, expectTypeOf, it } from 'vitest';

describe('@ai-sdk/perplexity', () => {
  it('exports PerplexityLanguageModelOptions for `providerOptions.perplexity`', () => {
    const options = {
      return_images: true,
      search_recency_filter: 'week',
    } satisfies PerplexityLanguageModelOptions;

    expectTypeOf(options).toMatchTypeOf<PerplexityLanguageModelOptions>();
  });
});
