import type {
  Experimental_BatchV4 as BatchV4,
  EmbeddingModelV4,
  ImageModelV4,
  LanguageModelV4,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { openai, type OpenAILanguageModelResponsesOptions } from './index';
import type { OpenAIResponsesModelId } from './responses/openai-responses-language-model-options';
import type {
  OpenAIChatLanguageModelV4ProviderOptions,
  OpenAICompletionLanguageModelV4ProviderOptions,
  OpenAIEmbeddingModelV4ProviderOptions,
  OpenAIImageModelV4ProviderOptions,
  OpenAIResponsesLanguageV4ProviderOptions,
  OpenAITranscriptionModelV4ProviderOptions,
} from './internal';
import type { OpenAISpeechTranslationModelV4ProviderOptions } from './speech-translation/openai-speech-translation-model';
import type { SpeechTranslationModelV4 } from '../../provider/src/speech-translation-model/v4/speech-translation-model-v4';

it('types batch support on the OpenAI provider', () => {
  expectTypeOf(openai.experimental_batch()).toMatchTypeOf<
    BatchV4<{ text: OpenAIResponsesModelId }>
  >();
  expectTypeOf(openai('gpt-5.6')).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(openai.languageModel('gpt-5.6')).toEqualTypeOf<
    LanguageModelV4<OpenAIResponsesLanguageV4ProviderOptions>
  >();
  expectTypeOf(openai.responses('gpt-5.6')).toEqualTypeOf<
    LanguageModelV4<OpenAIResponsesLanguageV4ProviderOptions>
  >();
  expectTypeOf(openai.chat('gpt-5.6')).toEqualTypeOf<
    LanguageModelV4<OpenAIChatLanguageModelV4ProviderOptions>
  >();
  expectTypeOf(openai.completion('gpt-3.5-turbo-instruct')).toEqualTypeOf<
    LanguageModelV4<OpenAICompletionLanguageModelV4ProviderOptions>
  >();
});

it('types GPT Image 2.5 models', () => {
  expectTypeOf(openai.image('gpt-image-2.5-flare')).toEqualTypeOf<
    ImageModelV4<OpenAIImageModelV4ProviderOptions>
  >();
  expectTypeOf(openai.image('gpt-image-2.5-flare-2026-09-08')).toEqualTypeOf<
    ImageModelV4<OpenAIImageModelV4ProviderOptions>
  >();
  expectTypeOf(openai.image('gpt-image-2.5-sunburst')).toEqualTypeOf<
    ImageModelV4<OpenAIImageModelV4ProviderOptions>
  >();
  expectTypeOf(openai.image('gpt-image-2.5-sunburst-2026-09-08')).toEqualTypeOf<
    ImageModelV4<OpenAIImageModelV4ProviderOptions>
  >();
});

it('types the explicit compaction trigger option', () => {
  expectTypeOf<
    OpenAILanguageModelResponsesOptions['compactionTrigger']
  >().toEqualTypeOf<boolean | undefined>();
});

it('types Embedding models', () => {
  expectTypeOf(openai.embedding('text-embedding-3-small')).toEqualTypeOf<
    EmbeddingModelV4<OpenAIEmbeddingModelV4ProviderOptions>
  >();
});

it('types Speech models', () => {
  expectTypeOf(openai.transcription('whisper-1')).toEqualTypeOf<
    TranscriptionModelV4<OpenAITranscriptionModelV4ProviderOptions>
  >();
});

it('tyipes Speech Translation models', () => {
  expectTypeOf(openai.translation('whisper-1')).toEqualTypeOf<
    SpeechTranslationModelV4<OpenAISpeechTranslationModelV4ProviderOptions>
  >();
});

it('types Transcription models', () => {
  expectTypeOf(openai.transcription('whisper-1')).toEqualTypeOf<
    TranscriptionModelV4<OpenAITranscriptionModelV4ProviderOptions>
  >();
});
