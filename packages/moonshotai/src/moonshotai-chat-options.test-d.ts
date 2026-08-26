import { describe, expectTypeOf, it } from 'vitest';
import type {
  MoonshotAIAssistantMessageProviderOptions,
  MoonshotAILanguageModelOptions,
  MoonshotAISystemMessageProviderOptions,
} from './index';

describe('MoonshotAILanguageModelOptions', () => {
  it('exposes official structured output, log probability, and reasoning options', () => {
    expectTypeOf<MoonshotAILanguageModelOptions>().toEqualTypeOf<{
      logprobs?: boolean;
      topLogprobs?: number;
      reasoningEffort?: 'low' | 'high' | 'max';
      thinking?: {
        type?: 'enabled' | 'disabled';
        budgetTokens?: number;
      };
      reasoningHistory?: 'disabled' | 'interleaved' | 'preserved';
      strictJsonSchema?: boolean;
      promptCacheKey?: string;
      safetyIdentifier?: string;
    }>();
  });

  it('rejects non-boolean strictJsonSchema values', () => {
    const invalidOptions: MoonshotAILanguageModelOptions = {
      // @ts-expect-error strictJsonSchema must be a boolean
      strictJsonSchema: 'false',
    };
    invalidOptions;
  });
});

describe('MoonshotAIAssistantMessageProviderOptions', () => {
  it('accepts participant names and Partial Mode', () => {
    const options = {
      name: 'writer',
      partial: true,
    } satisfies MoonshotAIAssistantMessageProviderOptions;

    expectTypeOf(options.partial).toEqualTypeOf<true>();
  });

  it('rejects partial false', () => {
    const options = {
      // @ts-expect-error Moonshot AI only supports enabling Partial Mode
      partial: false,
    } satisfies MoonshotAIAssistantMessageProviderOptions;

    expectTypeOf(options.partial).toEqualTypeOf<false>();
  });
});

describe('MoonshotAISystemMessageProviderOptions', () => {
  it('exposes names and complete dynamic function tools', () => {
    expectTypeOf<MoonshotAISystemMessageProviderOptions>().toMatchTypeOf<{
      name?: string;
      tools?: Array<{
        type: 'function';
        name: string;
        description?: string;
        inputSchema: object;
        strict?: boolean;
      }>;
    }>();
  });
});
