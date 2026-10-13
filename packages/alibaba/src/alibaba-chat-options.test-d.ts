import { describe, expectTypeOf, it } from 'vitest';
import type { AlibabaLanguageModelOptions } from './alibaba-chat-options';

describe('AlibabaLanguageModelOptions type', () => {
  it('should expose an optional boolean preserveThinking', () => {
    const options = {
      preserveThinking: true,
    } satisfies AlibabaLanguageModelOptions;

    expectTypeOf(options).toMatchTypeOf<AlibabaLanguageModelOptions>();
    expectTypeOf<
      AlibabaLanguageModelOptions['preserveThinking']
    >().toEqualTypeOf<boolean | undefined>();
  });

  it('should require preserveThinking to be a boolean', () => {
    const options: AlibabaLanguageModelOptions = {
      // @ts-expect-error - preserveThinking must be a boolean
      preserveThinking: 'true',
    };

    options;
  });
});
