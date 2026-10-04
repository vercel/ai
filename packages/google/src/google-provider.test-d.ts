import type {
  Experimental_BatchV4 as BatchV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { google } from './google-provider';
import type { GoogleModelId } from './google-language-model-options';
import type { GoogleImageModelId } from './google-image-settings';
import type { GoogleLanguageModelV4ProviderOptions } from './google-language-model';
import type { GoogleInteractionsModelV4ProviderOptions } from './interactions/google-interactions-language-model';

it('types batch support on the provider', () => {
  expectTypeOf(google.experimental_batch()).toEqualTypeOf<
    BatchV4<{ text: GoogleModelId; image: GoogleImageModelId }>
  >();
  expectTypeOf(google('gemini-3.6-flash')).toEqualTypeOf<
    LanguageModelV4<GoogleLanguageModelV4ProviderOptions>
  >();
  expectTypeOf(google.languageModel('gemini-3.6-flash')).toEqualTypeOf<
    LanguageModelV4<GoogleLanguageModelV4ProviderOptions>
  >();
  expectTypeOf(google.chat('gemini-3.6-flash')).toEqualTypeOf<
    LanguageModelV4<GoogleLanguageModelV4ProviderOptions>
  >();
  expectTypeOf(google.generativeAI('gemini-3.6-flash')).toEqualTypeOf<
    LanguageModelV4<GoogleLanguageModelV4ProviderOptions>
  >();
  expectTypeOf(google.interactions('gemini-3.6-flash')).toEqualTypeOf<
    LanguageModelV4<GoogleInteractionsModelV4ProviderOptions>
  >();
});
