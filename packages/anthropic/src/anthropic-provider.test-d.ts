import type {
  Experimental_BatchV4 as BatchV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import type {
  AnthropicLanguageModelOptions,
  AnthropicModelId,
} from './anthropic-language-model-options';
import { anthropic } from './anthropic-provider';
import type { AnthropicLanguageModelV4ProviderOptions } from './anthropic-language-model';

it('types batch support on the provider', () => {
  expectTypeOf(anthropic.experimental_batch()).toEqualTypeOf<
    BatchV4<{ text: AnthropicModelId }>
  >();
  expectTypeOf(anthropic('claude-3-haiku-20240307')).toEqualTypeOf<
    LanguageModelV4<AnthropicLanguageModelV4ProviderOptions>
  >();
  expectTypeOf(
    anthropic.languageModel('claude-3-haiku-20240307'),
  ).toEqualTypeOf<LanguageModelV4<AnthropicLanguageModelV4ProviderOptions>>();
  expectTypeOf(anthropic.chat('claude-3-haiku-20240307')).toEqualTypeOf<
    LanguageModelV4<AnthropicLanguageModelV4ProviderOptions>
  >();
  expectTypeOf(anthropic.messages('claude-3-haiku-20240307')).toEqualTypeOf<
    LanguageModelV4<AnthropicLanguageModelV4ProviderOptions>
  >();
});

it('types on-demand compaction provider options', () => {
  expectTypeOf<AnthropicLanguageModelOptions['compaction']>().toEqualTypeOf<
    | {
        type: 'summarize';
        instructions?: string;
      }
    | undefined
  >();
});
