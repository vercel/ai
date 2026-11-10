import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { GladiaTranscriptionModelOptions } from './gladia-transcription-model-options';

export const gladiaProviderOptions = {
  transcription: {
    contextPrompt: {
      description: 'Deprecated and ignored with an unsupported warning.',
    },
    customVocabulary: {
      description:
        'Custom vocabulary to improve transcription accuracy. Can be a boolean or an array of custom terms.',
    },
    customVocabularyConfig: {
      description: 'Configuration for custom vocabulary.',
    },
    detectLanguage: {
      description: 'Whether to automatically detect the language of the audio.',
    },
    enableCodeSwitching: {
      description:
        'Whether to enable code switching (multiple languages in the same audio).',
    },
    codeSwitchingConfig: { description: 'Configuration for code switching.' },
    language: { description: 'Specific language for transcription.' },
    languageConfig: {
      description: 'Language configuration for transcription.',
    },
    callback: {
      description: 'Whether to enable callback when transcription is complete.',
    },
    callbackConfig: { description: 'Configuration for callback.' },
    subtitles: { description: 'Whether to generate subtitles.' },
    subtitlesConfig: { description: 'Configuration for subtitles generation.' },
    diarization: {
      description:
        'Whether to enable speaker diarization (speaker identification).',
    },
    diarizationConfig: { description: 'Configuration for diarization.' },
    translation: { description: 'Whether to translate the transcription.' },
    translationConfig: { description: 'Configuration for translation.' },
    summarization: {
      description: 'Whether to generate a summary of the transcription.',
    },
    summarizationConfig: { description: 'Configuration for summarization.' },
    moderation: {
      description: 'Deprecated and ignored with an unsupported warning.',
    },
    namedEntityRecognition: {
      description: 'Whether to enable named entity recognition.',
    },
    chapterization: {
      description: 'Deprecated and ignored with an unsupported warning.',
    },
    nameConsistency: {
      description: 'Deprecated and ignored with an unsupported warning.',
    },
    customSpelling: { description: 'Whether to enable custom spelling.' },
    customSpellingConfig: { description: 'Configuration for custom spelling.' },
    structuredDataExtraction: {
      description: 'Deprecated and ignored with an unsupported warning.',
    },
    structuredDataExtractionConfig: {
      description: 'Deprecated and ignored with an unsupported warning.',
    },
    sentimentAnalysis: {
      description:
        'Whether to perform sentiment analysis on the transcription.',
    },
    audioToLlm: {
      description: 'Whether to send audio to a language model for processing.',
    },
    audioToLlmConfig: {
      description: 'Configuration for audio to language model processing.',
    },
    piiRedaction: { description: 'Whether to enable PII redaction.' },
    piiRedactionConfig: { description: 'Configuration for PII redaction.' },
    customMetadata: {
      description: 'Custom metadata to include with the transcription.',
    },
    sentences: {
      description: 'Whether to include sentence-level segmentation.',
    },
    displayMode: {
      description: 'Deprecated and ignored with an unsupported warning.',
    },
    punctuationEnhanced: {
      description: 'Whether to enhance punctuation in the transcription.',
    },
    pollIntervalMs: {
      description:
        'Interval between job status checks, in milliseconds; overrides the provider setting.',
    },
    pollTimeoutMs: {
      description:
        'Maximum polling time in milliseconds; overrides the provider setting.',
    },
  } satisfies Record<
    keyof GladiaTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const gladiaTranscriptionModelIds = ['solaria-1', 'solaria-3'] as const;

const modelPolicies: Record<
  string,
  { singleLanguage: boolean; omitModel: boolean }
> = {
  'solaria-1': { singleLanguage: false, omitModel: false },
  'solaria-3': { singleLanguage: true, omitModel: false },
  default: { singleLanguage: false, omitModel: true },
};
export function getGladiaTranscriptionModelEntry(modelId: string) {
  const policy = modelPolicies[modelId];
  const singleLanguage = policy?.singleLanguage ?? false;
  return {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: false,
        duration: true,
        segments: true,
        language: true,
      },
    },
    providerOptions: {
      transcription: {
        ...Object.fromEntries(
          Object.keys(gladiaProviderOptions.transcription).map(
            key => [key, policy != null ? true : 'unknown'] as const,
          ),
        ),
        contextPrompt: false,
        moderation: false,
        chapterization: false,
        nameConsistency: false,
        structuredDataExtraction: false,
        structuredDataExtractionConfig: false,
        displayMode: false,
        detectLanguage: singleLanguage
          ? false
          : policy != null
            ? true
            : 'unknown',
        enableCodeSwitching: singleLanguage
          ? false
          : policy != null
            ? true
            : 'unknown',
        codeSwitchingConfig: singleLanguage
          ? false
          : policy != null
            ? true
            : 'unknown',
        languageConfig: singleLanguage
          ? {
              condition:
                'Solaria-3 requires exactly one language and does not support code switching.',
            }
          : policy != null
            ? true
            : 'unknown',
      },
    },
    requestConfig: {
      transcription: { singleLanguage, omitModel: policy?.omitModel ?? false },
    },
  } as const satisfies ModelEntry<{
    transcription: { singleLanguage: boolean; omitModel: boolean };
  }>;
}

export const gladiaModelCatalog = Object.fromEntries(
  gladiaTranscriptionModelIds.map(id => [
    id,
    getGladiaTranscriptionModelEntry(id),
  ]),
);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type GladiaModelIds = {
  transcription: (typeof gladiaTranscriptionModelIds)[number];
};
