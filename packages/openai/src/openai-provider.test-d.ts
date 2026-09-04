import type {
  Experimental_BatchV4 as BatchV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { openai, type OpenAILanguageModelResponsesOptions } from './index';
import type { OpenAIResponsesModelId } from './responses/openai-responses-language-model-options';

it('types batch support on the OpenAI provider', () => {
  expectTypeOf(openai.experimental_batch()).toMatchTypeOf<
    BatchV4<{ text: OpenAIResponsesModelId }>
  >();
  expectTypeOf(openai('gpt-5.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    openai.languageModel('gpt-5.6'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(openai.responses('gpt-5.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(openai.chat('gpt-5.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    openai.completion('gpt-3.5-turbo-instruct'),
  ).toEqualTypeOf<LanguageModelV4>();
});

it('types the explicit compaction trigger option', () => {
  expectTypeOf<
    OpenAILanguageModelResponsesOptions['compactionTrigger']
  >().toEqualTypeOf<boolean | undefined>();
});
