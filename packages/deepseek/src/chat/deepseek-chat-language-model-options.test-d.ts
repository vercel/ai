import { describe, expectTypeOf, it } from 'vitest';
import type {
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekLanguageModelChatOptions,
} from '../index';

describe('DeepSeekLanguageModelChatOptions', () => {
  it('only exposes canonical thinking and reasoning effort values', () => {
    expectTypeOf<DeepSeekLanguageModelChatOptions>().toEqualTypeOf<{
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

it('should type assistant prefix completion options', () => {
  const options = {
    name: 'assistant',
    prefix: true,
  } satisfies DeepSeekAssistantMessageProviderOptions;

  expectTypeOf(options.name).toEqualTypeOf<string>();
  expectTypeOf(options.prefix).toEqualTypeOf<true>();
});

it('should reject prefix false', () => {
  const options = {
    // @ts-expect-error - DeepSeek only supports enabling prefix completion
    prefix: false,
  } satisfies DeepSeekAssistantMessageProviderOptions;

  expectTypeOf(options.prefix).toEqualTypeOf<false>();
});
