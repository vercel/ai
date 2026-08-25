import { describe, expectTypeOf, it } from 'vitest';
import type {
  MoonshotAIAssistantMessageProviderOptions,
  MoonshotAIMessageProviderOptions,
} from './index';

describe('MoonshotAIMessageProviderOptions', () => {
  it('exposes participant names', () => {
    expectTypeOf<MoonshotAIMessageProviderOptions>().toEqualTypeOf<{
      name?: string;
    }>();
  });

  it('exposes Partial Mode on assistant messages', () => {
    expectTypeOf<MoonshotAIAssistantMessageProviderOptions>().toEqualTypeOf<{
      name?: string;
      partial?: true;
    }>();
  });
});
