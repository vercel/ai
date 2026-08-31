import { expectTypeOf, it } from 'vitest';
import type { DeepSeekMessageProviderOptions } from '../index';

it('should expose typed DeepSeek message provider options', () => {
  expectTypeOf<DeepSeekMessageProviderOptions>().toEqualTypeOf<{
    name?: string;
  }>();
});

it('should reject non-string message names', () => {
  const options: DeepSeekMessageProviderOptions = {
    // @ts-expect-error DeepSeek message names must be strings.
    name: 123,
  };

  expectTypeOf(options).toEqualTypeOf<DeepSeekMessageProviderOptions>();
});
