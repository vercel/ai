import { describe, expectTypeOf, it } from 'vitest';
import type { MoonshotAIMessageProviderOptions } from './index';

describe('MoonshotAIMessageProviderOptions', () => {
  it('exposes participant names', () => {
    expectTypeOf<MoonshotAIMessageProviderOptions>().toEqualTypeOf<{
      name?: string;
    }>();
  });
});
