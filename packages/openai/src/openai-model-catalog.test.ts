import {
  getModelCapabilities,
  type ModelCatalog,
} from '@ai-sdk/provider-utils';
import type { KnownModelId } from '@ai-sdk/provider-utils/test';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { OpenAIChatModelId } from './chat/openai-chat-language-model-options';
import type { OpenAIEmbeddingModelId } from './embedding/openai-embedding-model-options';
import type { OpenAIImageModelId } from './image/openai-image-model-options';
import {
  getOpenAIReasoningCapabilities,
  openaiEmbeddingModelCatalog,
  openaiImageModelCatalog,
  openaiLanguageModelCatalog,
  openaiSpeechModelCatalog,
  openaiSpeechTranslationModelCatalog,
  openaiTranscriptionModelCatalog,
} from './openai-model-catalog';
import type { OpenAIResponsesModelId } from './responses/openai-responses-language-model-options';
import type { OpenAISpeechTranslationModelId } from './speech-translation/openai-speech-translation-model-options';
import type { OpenAISpeechModelId } from './speech/openai-speech-model-options';
import type { OpenAITranscriptionModelId } from './transcription/openai-transcription-model-options';

// The lists below must contain exactly the model IDs of the model ID types.
// Type checking fails when an ID is missing or not part of the type.

type LanguageModelId = KnownModelId<OpenAIChatModelId | OpenAIResponsesModelId>;
const languageModelIds = [
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0125',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-16k',
  'gpt-4.1',
  'gpt-4.1-2025-04-14',
  'gpt-4.1-mini',
  'gpt-4.1-mini-2025-04-14',
  'gpt-4.1-nano',
  'gpt-4.1-nano-2025-04-14',
  'gpt-4o',
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-11-20',
  'gpt-4o-audio-preview',
  'gpt-4o-audio-preview-2024-12-17',
  'gpt-4o-audio-preview-2025-06-03',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gpt-4o-mini-audio-preview',
  'gpt-4o-mini-audio-preview-2024-12-17',
  'gpt-4o-mini-search-preview',
  'gpt-4o-mini-search-preview-2025-03-11',
  'gpt-4o-search-preview',
  'gpt-4o-search-preview-2025-03-11',
  'gpt-5',
  'gpt-5-2025-08-07',
  'gpt-5-chat-latest',
  'gpt-5-codex',
  'gpt-5-mini',
  'gpt-5-mini-2025-08-07',
  'gpt-5-nano',
  'gpt-5-nano-2025-08-07',
  'gpt-5-pro',
  'gpt-5-pro-2025-10-06',
  'gpt-5.1',
  'gpt-5.1-2025-11-13',
  'gpt-5.1-chat-latest',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.2',
  'gpt-5.2-2025-12-11',
  'gpt-5.2-chat-latest',
  'gpt-5.2-codex',
  'gpt-5.2-pro',
  'gpt-5.2-pro-2025-12-11',
  'gpt-5.3-chat-latest',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-2026-03-05',
  'gpt-5.4-mini',
  'gpt-5.4-mini-2026-03-17',
  'gpt-5.4-nano',
  'gpt-5.4-nano-2026-03-17',
  'gpt-5.4-pro',
  'gpt-5.4-pro-2026-03-05',
  'gpt-5.5',
  'gpt-5.5-2026-04-23',
  'gpt-5.6',
  'gpt-5.6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-6-astra',
  'gpt-6-luna',
  'gpt-6-sol',
  'gpt-6.1-sol',
  'gpt-6.1-terra',
  'o1',
  'o1-2024-12-17',
  'o3',
  'o3-2025-04-16',
  'o3-mini',
  'o3-mini-2025-01-31',
  'o4-mini',
  'o4-mini-2025-04-16',
] as const satisfies readonly LanguageModelId[];
expectTypeOf<
  Exclude<LanguageModelId, (typeof languageModelIds)[number]>
>().toBeNever();

const imageModelIds = [
  'dall-e-3',
  'dall-e-2',
  'gpt-image-1',
  'gpt-image-1-mini',
  'gpt-image-1.5',
  'gpt-image-2',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-flare-2026-09-08',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-sunburst-2026-09-08',
  'chatgpt-image-latest',
] as const satisfies readonly KnownModelId<OpenAIImageModelId>[];
expectTypeOf<
  Exclude<KnownModelId<OpenAIImageModelId>, (typeof imageModelIds)[number]>
>().toBeNever();

const transcriptionModelIds = [
  'whisper-1',
  'gpt-4o-mini-transcribe',
  'gpt-4o-mini-transcribe-2025-03-20',
  'gpt-4o-mini-transcribe-2025-12-15',
  'gpt-4o-transcribe',
  'gpt-4o-transcribe-diarize',
  'gpt-live-transcribe',
  'gpt-realtime-whisper',
  'gpt-transcribe',
] as const satisfies readonly KnownModelId<OpenAITranscriptionModelId>[];
expectTypeOf<
  Exclude<
    KnownModelId<OpenAITranscriptionModelId>,
    (typeof transcriptionModelIds)[number]
  >
>().toBeNever();

const speechModelIds = [
  'tts-1',
  'tts-1-1106',
  'tts-1-hd',
  'tts-1-hd-1106',
  'gpt-4o-mini-tts',
  'gpt-4o-mini-tts-2025-03-20',
  'gpt-4o-mini-tts-2025-12-15',
] as const satisfies readonly KnownModelId<OpenAISpeechModelId>[];
expectTypeOf<
  Exclude<KnownModelId<OpenAISpeechModelId>, (typeof speechModelIds)[number]>
>().toBeNever();

const embeddingModelIds = [
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
] as const satisfies readonly KnownModelId<OpenAIEmbeddingModelId>[];
expectTypeOf<
  Exclude<
    KnownModelId<OpenAIEmbeddingModelId>,
    (typeof embeddingModelIds)[number]
  >
>().toBeNever();

const speechTranslationModelIds = [
  'gpt-realtime-translate',
] as const satisfies readonly KnownModelId<OpenAISpeechTranslationModelId>[];
expectTypeOf<
  Exclude<
    KnownModelId<OpenAISpeechTranslationModelId>,
    (typeof speechTranslationModelIds)[number]
  >
>().toBeNever();

function resolveAll<CAPABILITIES>(
  catalog: ModelCatalog<CAPABILITIES>,
  modelIds: readonly string[],
) {
  return Object.fromEntries(
    modelIds.map(modelId => [
      modelId,
      getModelCapabilities(catalog, modelId).capabilities,
    ]),
  );
}

describe.each([
  ['language', openaiLanguageModelCatalog, languageModelIds],
  ['image', openaiImageModelCatalog, imageModelIds],
  ['transcription', openaiTranscriptionModelCatalog, transcriptionModelIds],
  ['speech', openaiSpeechModelCatalog, speechModelIds],
  ['embedding', openaiEmbeddingModelCatalog, embeddingModelIds],
  [
    'speech translation',
    openaiSpeechTranslationModelCatalog,
    speechTranslationModelIds,
  ],
] as const)('%s model catalog', (_, catalog, modelIds) => {
  it.each(modelIds)('knows %s', modelId => {
    expect(
      getModelCapabilities(catalog as ModelCatalog<unknown>, modelId)
        .isKnownModel,
    ).toBe(true);
  });

  it('resolves the capabilities of every model ID', () => {
    expect(
      resolveAll(catalog as ModelCatalog<unknown>, modelIds),
    ).toMatchSnapshot();
  });
});

describe('openaiLanguageModelCatalog', () => {
  it('resolves model IDs that are not listed', () => {
    expect(
      Object.fromEntries(
        [
          // Snapshots and fine-tuned models:
          'gpt-5.4-2026-03-05',
          'ft:gpt-4o-mini-2024-07-18:my-org::abc123',
          'ft:o4-mini-2025-04-16:my-org::abc123',
          // Model families:
          'gpt-5.7',
          'gpt-5.7-nano',
          'gpt-7',
          'gpt-10.1',
          'o5',
          // Unknown models:
          'llama-3.1-8b',
        ].map(modelId => [
          modelId,
          getModelCapabilities(openaiLanguageModelCatalog, modelId),
        ]),
      ),
    ).toMatchSnapshot();
  });
});

describe('getOpenAIReasoningCapabilities', () => {
  const gpt5 = getModelCapabilities(
    openaiLanguageModelCatalog,
    'gpt-5',
  ).capabilities;
  const gpt4o = getModelCapabilities(
    openaiLanguageModelCatalog,
    'gpt-4o',
  ).capabilities;

  it('returns the reasoning capabilities of the model', () => {
    expect(getOpenAIReasoningCapabilities(gpt5, undefined)).toBe(
      gpt5.reasoning,
    );
    expect(getOpenAIReasoningCapabilities(gpt4o, undefined)).toBeUndefined();
  });

  it('treats a model as reasoning when reasoning is forced', () => {
    expect(getOpenAIReasoningCapabilities(gpt4o, true)).toEqual({
      samplingWithEffortNone: false,
      logprobs: true,
    });
    expect(getOpenAIReasoningCapabilities(gpt5, true)).toBe(gpt5.reasoning);
  });

  it('treats a model as non-reasoning when reasoning is disabled', () => {
    expect(getOpenAIReasoningCapabilities(gpt5, false)).toBeUndefined();
  });
});
