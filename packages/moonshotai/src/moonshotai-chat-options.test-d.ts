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
    }>();
  });

  it('rejects non-boolean strictJsonSchema values', () => {
    const invalidOptions: MoonshotAIProviderOptions = {
      // @ts-expect-error strictJsonSchema must be a boolean
      strictJsonSchema: 'false',
    };
    invalidOptions;
  });
});
