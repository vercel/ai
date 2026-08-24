import { describe, expectTypeOf, it } from 'vitest';
import type {
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekLanguageModelChatOptions,
} from '../index';

describe('DeepSeekLanguageModelChatOptions', () => {
  it('only exposes canonical thinking and reasoning effort values', () => {
    expectTypeOf<DeepSeekLanguageModelChatOptions>().toEqualTypeOf<{
      userId?: string;
      thinking?: {
        type?: 'enabled' | 'disabled';
      };
      reasoningEffort?: 'low' | 'high' | 'max';
      strictJsonSchema?: boolean;
    }>();
  });
});

it('should type assistant prefix completion options', () => {
  const options = {
    prefix: true,
  } satisfies DeepSeekAssistantMessageProviderOptions;

  expectTypeOf(options.prefix).toEqualTypeOf<true>();
});

it('should reject prefix false', () => {
  const options = {
    // @ts-expect-error - DeepSeek only supports enabling prefix completion
    prefix: false,
  } satisfies DeepSeekAssistantMessageProviderOptions;

  expectTypeOf(options.prefix).toEqualTypeOf<false>();
});
