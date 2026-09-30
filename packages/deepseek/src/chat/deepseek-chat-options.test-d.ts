import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekChatOptions } from '../index';

describe('DeepSeekChatOptions', () => {
  it('only exposes canonical thinking and reasoning effort values', () => {
    expectTypeOf<DeepSeekChatOptions>().toEqualTypeOf<{
      logprobs?: boolean;
      topLogprobs?: number;
      userId?: string;
      thinking?: {
        type?: 'enabled' | 'disabled';
      };
      reasoningEffort?: 'low' | 'high' | 'max';
      strictJsonSchema?: boolean;
    }>();
  });
});
