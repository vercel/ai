import { describe, expectTypeOf, it } from 'vitest';
import type { MoonshotAILanguageModelOptions } from './index';

describe('MoonshotAILanguageModelOptions', () => {
  it('only exposes official thinking and reasoning effort fields', () => {
    expectTypeOf<MoonshotAILanguageModelOptions>().toEqualTypeOf<{
      reasoningEffort?: 'low' | 'high' | 'max';
      thinking?: {
        type?: 'enabled' | 'disabled';
        budgetTokens?: number;
      };
      reasoningHistory?: 'disabled' | 'interleaved' | 'preserved';
      promptCacheKey?: string;
      safetyIdentifier?: string;
    }>();
  });
});
