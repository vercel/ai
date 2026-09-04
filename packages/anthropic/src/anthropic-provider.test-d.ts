import type {
  Experimental_BatchV4 as BatchV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import type { AnthropicModelId } from './anthropic-language-model-options';
import { anthropic } from './anthropic-provider';

it('types batch support on the provider', () => {
  expectTypeOf(anthropic.experimental_batch()).toEqualTypeOf<
    BatchV4<{ text: AnthropicModelId }>
  >();
  expectTypeOf(
    anthropic('claude-3-haiku-20240307'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    anthropic.languageModel('claude-3-haiku-20240307'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    anthropic.chat('claude-3-haiku-20240307'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    anthropic.messages('claude-3-haiku-20240307'),
  ).toEqualTypeOf<LanguageModelV4>();
});
