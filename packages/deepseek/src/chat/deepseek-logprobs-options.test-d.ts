import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekLanguageModelOptions } from '../index';

describe('DeepSeekLanguageModelOptions logprobs', () => {
  it('exposes logprobs options', () => {
    expectTypeOf<
      Pick<DeepSeekLanguageModelOptions, 'logprobs' | 'topLogprobs'>
    >().toEqualTypeOf<{
      logprobs?: boolean;
      topLogprobs?: number;
    }>();
  });
});
