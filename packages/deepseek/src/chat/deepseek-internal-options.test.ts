import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  deepseekAssistantMessageProviderOptions,
  deepseekLanguageModelChatOptions,
  deepseekMessageProviderOptions,
} from '../internal';

describe('DeepSeek internal schema compatibility', () => {
  it('keeps chat options as a composable Zod object', () => {
    expect(deepseekLanguageModelChatOptions).toBeInstanceOf(z.ZodObject);
    expect(deepseekLanguageModelChatOptions.parse({ topLogprobs: 20 })).toEqual(
      { topLogprobs: 20 },
    );
    expect(
      deepseekLanguageModelChatOptions.safeParse({ topLogprobs: 21 }).success,
    ).toBe(false);
    expect(
      deepseekLanguageModelChatOptions
        .extend({ extra: z.string() })
        .parse({ extra: 'value' }),
    ).toEqual({ extra: 'value' });
  });

  it('keeps message schemas and their shared field composable', () => {
    expect(deepseekMessageProviderOptions).toBeInstanceOf(z.ZodObject);
    expect(deepseekAssistantMessageProviderOptions).toBeInstanceOf(z.ZodObject);
    expect(deepseekAssistantMessageProviderOptions.shape.name).toBe(
      deepseekMessageProviderOptions.shape.name,
    );
    expect(
      deepseekAssistantMessageProviderOptions.parse({
        name: 'assistant',
        prefix: true,
      }),
    ).toEqual({ name: 'assistant', prefix: true });
    expect(
      deepseekMessageProviderOptions
        .extend({ extra: z.string() })
        .parse({ name: 'user', extra: 'value' }),
    ).toEqual({ name: 'user', extra: 'value' });
  });
});
