import { describe, expectTypeOf, it } from 'vitest';
import type { MoonshotAIMessageProviderOptions } from './index';

describe('MoonshotAIMessageProviderOptions', () => {
  it('accepts a string participant name', () => {
    expectTypeOf<MoonshotAIMessageProviderOptions>().toEqualTypeOf<{
      name?: string;
    }>();
  });

  it('rejects a non-string name', () => {
    const invalidOptions: MoonshotAIMessageProviderOptions = {
      // @ts-expect-error name must be a string
      name: 123,
    };
    invalidOptions;
  });
});
