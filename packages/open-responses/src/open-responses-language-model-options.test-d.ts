import { describe, expectTypeOf, it } from 'vitest';
import type { OpenResponsesLanguageModelOptions } from '.';

describe('OpenResponsesLanguageModelOptions', () => {
  it('should allow arbitrary provider-native reasoning effort strings', () => {
    const providerNativeEffort: string = 'provider-specific-effort';
    const options = {
      reasoningEffort: providerNativeEffort,
    } satisfies OpenResponsesLanguageModelOptions;

    expectTypeOf(options).toMatchTypeOf<OpenResponsesLanguageModelOptions>();
  });
});
