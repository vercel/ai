import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekLanguageModelOptions } from '../index';

describe('DeepSeekLanguageModelOptions', () => {
  it('only exposes canonical thinking and reasoning effort values', () => {
    expectTypeOf<DeepSeekLanguageModelOptions>().toEqualTypeOf<{
      userId?: string;
      thinking?: {
        type?: 'enabled' | 'disabled';
      };
      reasoningEffort?: 'low' | 'high' | 'max';
      strictJsonSchema?: boolean;
    }>();
  });
});
