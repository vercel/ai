import { type InferSchema } from '@ai-sdk/provider-utils';
import { expectTypeOf, it } from 'vitest';
import type { DeepSeekErrorData } from '../index';
import type {
  DeepSeekChatLogprob,
  DeepSeekChatTokenUsage,
  deepseekChatChunkSchema,
  deepseekChatResponseSchema,
  deepSeekErrorSchema,
} from './deepseek-chat-api-types';
import {
  deepseekAssistantMessageProviderOptions,
  deepseekLanguageModelChatOptions,
  deepseekMessageProviderOptions,
} from '../internal';

it('preserves inferred response and stream data types', () => {
  expectTypeOf<DeepSeekErrorData>().toEqualTypeOf<{
    error: {
      message: string;
      type?: string | null;
      param?: any;
      code?: string | number | null;
    };
  }>();
  expectTypeOf<
    InferSchema<typeof deepSeekErrorSchema>
  >().toEqualTypeOf<DeepSeekErrorData>();
  type Response = InferSchema<typeof deepseekChatResponseSchema>;
  type Chunk = Exclude<
    InferSchema<typeof deepseekChatChunkSchema>,
    DeepSeekErrorData
  >;
  expectTypeOf<Response['usage']>().toEqualTypeOf<DeepSeekChatTokenUsage>();
  expectTypeOf<Chunk['usage']>().toEqualTypeOf<DeepSeekChatTokenUsage>();
  expectTypeOf<
    NonNullable<
      NonNullable<Response['choices'][number]['logprobs']>['content']
    >[number]
  >().toEqualTypeOf<DeepSeekChatLogprob>();
});

it('keeps internal schemas assignable as Zod objects with their original fields', () => {
  expectTypeOf(deepseekMessageProviderOptions.parse({})).toEqualTypeOf<{
    name?: string;
  }>();
  expectTypeOf(
    deepseekAssistantMessageProviderOptions.parse({}),
  ).toEqualTypeOf<{ name?: string; prefix?: true }>();
  expectTypeOf(
    deepseekLanguageModelChatOptions.parse({}).thinking,
  ).toEqualTypeOf<{ type?: 'adaptive' | 'enabled' | 'disabled' } | undefined>();
});
