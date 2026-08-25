import { describe, expectTypeOf, it } from 'vitest';
import type {
  MoonshotAIAssistantMessageProviderOptions,
  MoonshotAIMessageProviderOptions,
  MoonshotAISystemMessageProviderOptions,
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

  it('exposes dynamic tools on system messages', () => {
    expectTypeOf<MoonshotAISystemMessageProviderOptions>().toMatchTypeOf<{
      name?: string;
      dynamicTools?: Array<{
        type: 'function';
        name: string;
        description?: string;
        inputSchema: object;
        strict?: boolean;
      }>;
    }>();
  });
});
