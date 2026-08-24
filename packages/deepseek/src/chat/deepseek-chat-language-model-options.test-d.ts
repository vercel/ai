import { describe, expectTypeOf, it } from 'vitest';
import type {
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekLanguageModelChatOptions,
} from '../index';

describe('DeepSeekLanguageModelChatOptions', () => {
  it('types log probability options', () => {
    expectTypeOf<DeepSeekLanguageModelChatOptions['logprobs']>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<
      DeepSeekLanguageModelChatOptions['topLogprobs']
    >().toEqualTypeOf<number | undefined>();

    const options = {
      logprobs: true,
      topLogprobs: 20,
    } satisfies DeepSeekLanguageModelChatOptions;

    expectTypeOf(options).toMatchTypeOf<DeepSeekLanguageModelChatOptions>();
  });

  it('rejects non-boolean logprobs values', () => {
    const options = {
      // @ts-expect-error logprobs must be a boolean
      logprobs: 1,
    } satisfies DeepSeekLanguageModelChatOptions;

    expectTypeOf(options).not.toMatchTypeOf<DeepSeekLanguageModelChatOptions>();
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
