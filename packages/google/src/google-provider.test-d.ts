import type {
  Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { google } from './google-provider';

it('types only Google Generative AI models with their batch capability', () => {
  expectTypeOf(
    google('gemini-3.6-flash'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    google.languageModel('gemini-3.6-flash'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    google.chat('gemini-3.6-flash'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    google.generativeAI('gemini-3.6-flash'),
  ).toMatchTypeOf<BatchLanguageModelV4>();
  expectTypeOf(
    google.interactions('gemini-3.6-flash'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    google.interactions('gemini-3.6-flash'),
  ).not.toMatchTypeOf<BatchLanguageModelV4>();
});
