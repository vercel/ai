import { expectTypeOf, it } from 'vitest';
import type { DeepSeekAssistantMessageProviderOptions } from '../index';

it('should type assistant prefix completion options', () => {
  const options = {
    name: 'assistant',
    prefix: true,
  } satisfies DeepSeekAssistantMessageProviderOptions;

  expectTypeOf(options.name).toEqualTypeOf<string>();
  expectTypeOf(options.prefix).toEqualTypeOf<true>();
});

it('should reject prefix false', () => {
  const options = {
    // @ts-expect-error - DeepSeek only supports enabling prefix completion
    prefix: false,
  } satisfies DeepSeekAssistantMessageProviderOptions;

  expectTypeOf(options.prefix).toEqualTypeOf<false>();
});
