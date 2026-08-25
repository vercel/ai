import { describe, expectTypeOf, it } from 'vitest';
import type { MoonshotAILanguageModelOptions } from '.';

describe('MoonshotAILanguageModelOptions', () => {
  it('should describe supported reasoning and thinking values', () => {
    const options = {
      reasoningEffort: 'max',
      thinking: {
        type: 'disabled',
      },
      reasoningHistory: 'preserved',
    } as const satisfies MoonshotAILanguageModelOptions;

    expectTypeOf(options).toMatchTypeOf<MoonshotAILanguageModelOptions>();
  });

  it('should retain the deprecated budget option for source compatibility', () => {
    const options = {
      thinking: {
        type: 'enabled',
        budgetTokens: 2048,
      },
    } as const satisfies MoonshotAILanguageModelOptions;

    expectTypeOf(options).toMatchTypeOf<MoonshotAILanguageModelOptions>();
  });

  it('should reject values outside the Moonshot option schema', () => {
    const options = {
      // @ts-expect-error - K3 only supports low, high, and max
      reasoningEffort: 'medium',
      thinking: {
        // @ts-expect-error - Moonshot thinking only supports enabled or disabled
        type: 'automatic',
      },
    } satisfies MoonshotAILanguageModelOptions;

    expectTypeOf(options).toBeObject();
  });
});
