import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekLanguageModelChatOptions } from './deepseek-chat-language-model-options';

describe('DeepSeekLanguageModelChatOptions', () => {
  it('only exposes canonical thinking and reasoning effort values', () => {
    expectTypeOf<DeepSeekLanguageModelChatOptions>().toEqualTypeOf<{
      thinking?: {
        type?: 'enabled' | 'disabled';
      };
      reasoningEffort?: 'low' | 'high' | 'max';
      strictJsonSchema?: boolean;
    }>();
  });
});
