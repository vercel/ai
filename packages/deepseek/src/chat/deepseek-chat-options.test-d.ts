import { describe, expectTypeOf, it } from 'vitest';
import type { DeepSeekChatOptions } from '../index';

describe('DeepSeekChatOptions', () => {
  it('only exposes canonical thinking and reasoning effort values', () => {
    expectTypeOf<DeepSeekChatOptions>().toEqualTypeOf<{
      userId?: string;
      thinking?: {
        type?: 'enabled' | 'disabled';
      };
      reasoningEffort?: 'low' | 'high' | 'max';
      strictJsonSchema?: boolean;
    }>();
  });
});
