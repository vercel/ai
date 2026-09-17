import { describe, expectTypeOf, it } from 'vitest';
import type { AlibabaLanguageModelChatOptions } from './alibaba-chat-language-model-options';

describe('AlibabaLanguageModelChatOptions type', () => {
  it('should expose an optional boolean preserveThinking', () => {
    const options = {
      preserveThinking: true,
    } satisfies AlibabaLanguageModelChatOptions;

    expectTypeOf(options).toMatchTypeOf<AlibabaLanguageModelChatOptions>();
    expectTypeOf<
      AlibabaLanguageModelChatOptions['preserveThinking']
    >().toEqualTypeOf<boolean | undefined>();
  });

  it('should require preserveThinking to be a boolean', () => {
    const options: AlibabaLanguageModelChatOptions = {
      // @ts-expect-error - preserveThinking must be a boolean
      preserveThinking: 'true',
    };

    options;
  });
});
