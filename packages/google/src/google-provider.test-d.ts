import type {
  Experimental_BatchV4 as BatchV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { google } from './google-provider';
import type { GoogleModelId } from './google-language-model-options';

it('types batch support on the provider', () => {
  expectTypeOf(google.experimental_batch()).toEqualTypeOf<
    BatchV4<{ text: GoogleModelId }>
  >();
  expectTypeOf(google('gemini-3.6-flash')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    google.languageModel('gemini-3.6-flash'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    google.chat('gemini-3.6-flash'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    google.generativeAI('gemini-3.6-flash'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    google.interactions('gemini-3.6-flash'),
  ).toEqualTypeOf<LanguageModelV4>();
});
