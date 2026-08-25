import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekChatOptions } from '../index';

describe('DeepSeekChatOptions logprobs', () => {
  it('exposes logprobs options', () => {
    expectTypeOf<
      Pick<DeepSeekChatOptions, 'logprobs' | 'topLogprobs'>
    >().toEqualTypeOf<{
      logprobs?: boolean;
      topLogprobs?: number;
    }>();
  });
});
