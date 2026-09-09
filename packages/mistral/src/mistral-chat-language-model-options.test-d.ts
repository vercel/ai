import { expectTypeOf } from 'vitest';
import type { MistralLanguageModelChatOptions } from '.';

const options = {
  promptCacheKey: 'classification-workflow-123',
} satisfies MistralLanguageModelChatOptions;

expectTypeOf(options).toMatchTypeOf<MistralLanguageModelChatOptions>();
expectTypeOf<
  NonNullable<MistralLanguageModelChatOptions['promptCacheKey']>
>().toEqualTypeOf<string>();

const invalidOptions: MistralLanguageModelChatOptions = {
  // @ts-expect-error prompt cache keys must be strings
  promptCacheKey: 123,
};
invalidOptions;
