import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekLanguageModelOptions } from '.';

describe('DeepSeekLanguageModelOptions type', () => {
  it('should expose an optional string userId', () => {
    const options = {
      userId: 'tenant_123-user',
    } satisfies DeepSeekLanguageModelOptions;

    expectTypeOf(options).toMatchTypeOf<DeepSeekLanguageModelOptions>();
    expectTypeOf<DeepSeekLanguageModelOptions['userId']>().toEqualTypeOf<
      string | undefined
    >();
  });

  it('should require userId to be a string', () => {
    const options: DeepSeekLanguageModelOptions = {
      // @ts-expect-error - userId must be a string
      userId: 123,
    };

    options;
  });
});
