import { expectTypeOf, it } from 'vitest';
import type { MoonshotAIMessageProviderOptions } from './index';

it('should expose typed Moonshot AI message provider options', () => {
  expectTypeOf<MoonshotAIMessageProviderOptions>().toEqualTypeOf<{
    name?: string;
  }>();
});

it('should reject non-string message names', () => {
  const options: MoonshotAIMessageProviderOptions = {
    // @ts-expect-error Moonshot AI message names must be strings.
    name: 123,
  };

  expectTypeOf(options).toEqualTypeOf<MoonshotAIMessageProviderOptions>();
});
