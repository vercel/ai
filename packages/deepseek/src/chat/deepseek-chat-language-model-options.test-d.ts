import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekLanguageModelChatOptions } from '../index';

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
