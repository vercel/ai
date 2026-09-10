import type {
  Experimental_BatchV4 as BatchV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { xai } from './index';
import type { XaiResponsesModelId } from './responses/xai-responses-language-model-options';
import type { XaiImageModelId } from './xai-image-settings';

it('types batch support on the provider', () => {
  expectTypeOf(xai.experimental_batch()).toEqualTypeOf<
    BatchV4<{ text: XaiResponsesModelId; image: XaiImageModelId }>
  >();
  expectTypeOf(xai('grok-4.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(xai.languageModel('grok-4.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(xai.responses('grok-4.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(xai.chat('grok-4.6')).toEqualTypeOf<LanguageModelV4>();
});
