import { expectTypeOf, it } from 'vitest';
import type {
  MoonshotAIAssistantMessageProviderOptions,
  MoonshotAIMessageProviderOptions,
} from './index';

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

it('should expose typed Moonshot AI assistant message provider options', () => {
  expectTypeOf<MoonshotAIAssistantMessageProviderOptions>().toEqualTypeOf<{
    name?: string;
    partial?: true;
  }>();
});

it('should reject false for Partial Mode', () => {
  const options: MoonshotAIAssistantMessageProviderOptions = {
    // @ts-expect-error Moonshot AI Partial Mode only accepts true.
    partial: false,
  };

  expectTypeOf(
    options,
  ).toEqualTypeOf<MoonshotAIAssistantMessageProviderOptions>();
});
