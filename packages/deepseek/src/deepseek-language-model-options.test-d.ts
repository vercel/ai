import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekChatOptions } from '.';

describe('DeepSeekChatOptions type', () => {
  it('should expose an optional string userId', () => {
    const options = {
      userId: 'tenant_123-user',
    } satisfies DeepSeekChatOptions;

    expectTypeOf(options).toMatchTypeOf<DeepSeekChatOptions>();
    expectTypeOf<DeepSeekChatOptions['userId']>().toEqualTypeOf<
      string | undefined
    >();
  });

  it('should require userId to be a string', () => {
    const options: DeepSeekChatOptions = {
      // @ts-expect-error - userId must be a string
      userId: 123,
    };

    options;
  });
});
