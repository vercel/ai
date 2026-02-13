import type { OpenAIImageModelOptions } from '@ai-sdk/openai';
import { describe, expectTypeOf, it } from 'vitest';

describe('@ai-sdk/openai', () => {
  it('exports OpenAIImageModelOptions for `providerOptions.openai`', () => {
    const options = {
      quality: 'high',
      style: 'vivid',
      output_format: 'webp',
      background: 'transparent',
    } satisfies OpenAIImageModelOptions;

    expectTypeOf(options).toMatchTypeOf<OpenAIImageModelOptions>();
  });
});
