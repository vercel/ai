import { describe, expectTypeOf, it } from 'vitest';
import type { MoonshotAIProviderOptions } from './index';

describe('MoonshotAIProviderOptions', () => {
  it('only exposes official thinking and reasoning effort fields', () => {
    expectTypeOf<MoonshotAIProviderOptions>().toEqualTypeOf<{
      reasoningEffort?: 'low' | 'high' | 'max';
      thinking?: {
        type?: 'enabled' | 'disabled';
        budgetTokens?: number;
      };
      reasoningHistory?: 'disabled' | 'interleaved' | 'preserved';
      strictJsonSchema?: boolean;
      logprobs?: boolean;
      topLogprobs?: number;
    }>();
  });

  it('rejects invalid logprobs options', () => {
    const invalidLogprobs: MoonshotAIProviderOptions = {
      // @ts-expect-error logprobs must be a boolean
      logprobs: 1,
    };
    const invalidTopLogprobs: MoonshotAIProviderOptions = {
      // @ts-expect-error topLogprobs must be a number
      topLogprobs: '1',
    };
    invalidLogprobs;
    invalidTopLogprobs;
  });

  it('rejects non-boolean strictJsonSchema values', () => {
    const invalidOptions: MoonshotAIProviderOptions = {
      // @ts-expect-error strictJsonSchema must be a boolean
      strictJsonSchema: 'false',
    };
    invalidOptions;
  });
});
