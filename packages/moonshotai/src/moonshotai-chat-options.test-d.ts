import { describe, expectTypeOf, it } from 'vitest';
import type { MoonshotAILanguageModelOptions } from './index';

describe('MoonshotAILanguageModelOptions', () => {
  it('exposes supported and backwards-compatible option fields', () => {
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
