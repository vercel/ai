import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekLanguageModelChatOptions } from '.';

describe('DeepSeekLanguageModelChatOptions type', () => {
  it('should expose an optional string userId', () => {
    const options = {
      userId: 'tenant_123-user',
    } satisfies DeepSeekLanguageModelChatOptions;

    expectTypeOf(options).toMatchTypeOf<DeepSeekLanguageModelChatOptions>();
    expectTypeOf<DeepSeekLanguageModelChatOptions['userId']>().toEqualTypeOf<
      string | undefined
    >();
  });

  it('should require userId to be a string', () => {
    const options: DeepSeekLanguageModelChatOptions = {
      // @ts-expect-error - userId must be a string
      userId: 123,
    };

    options;
  });
});
