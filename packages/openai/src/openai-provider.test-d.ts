import type {
  Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { openai, type OpenAILanguageModelResponsesOptions } from './index';

it('types only OpenAI Responses models with their batch capability', () => {
  expectTypeOf(openai('gpt-5.6')).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    openai.languageModel('gpt-5.6'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    openai.responses('gpt-5.6'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(openai.chat('gpt-5.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    openai.chat('gpt-5.6'),
  ).not.toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    openai.completion('gpt-3.5-turbo-instruct'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    openai.completion('gpt-3.5-turbo-instruct'),
  ).not.toMatchTypeOf<BatchLanguageModelV4>();
});

it('types the explicit compaction trigger option', () => {
  expectTypeOf<
    OpenAILanguageModelResponsesOptions['compactionTrigger']
  >().toEqualTypeOf<boolean | undefined>();
});
