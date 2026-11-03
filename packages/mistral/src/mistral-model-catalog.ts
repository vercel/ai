import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type {
  MistralChatModelId,
  MistralLanguageModelChatOptions,
} from './mistral-chat-language-model-options';
import type { MistralEmbeddingModelOptions } from './mistral-embedding-model-options';
import type { MistralSpeechModelOptions } from './mistral-speech-model-options';
import type { MistralTranscriptionModelOptions } from './mistral-transcription-model-options';

export const mistralProviderOptions = {
  language: {
    safePrompt: { description: 'Inject a safety prompt. Chat API only.' },
    documentImageLimit: {
      description: 'Maximum document images. Chat API only.',
    },
    documentPageLimit: {
      description: 'Maximum document pages. Chat API only.',
    },
    structuredOutputs: {
      description: 'Whether to send a JSON response schema.',
    },
    strictJsonSchema: {
      description: 'Whether to use strict JSON schema validation.',
    },
    parallelToolCalls: {
      description: 'Allow parallel function calls. Chat API only.',
    },
    promptCacheKey: { description: 'Cache affinity key. Chat API only.' },
    reasoningEffort: {
      description: 'Reasoning effort for configurable reasoning models.',
    },
  } satisfies Record<
    keyof MistralLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
  embedding: {
    metadata: { description: 'Metadata attached to the embedding request.' },
    outputDimension: { description: 'Output embedding dimensions.' },
    outputDtype: { description: 'Output embedding data type.' },
  } satisfies Record<
    keyof MistralEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  transcription: {
    language: { description: 'Language of the audio.' },
    returnLanguage: { description: 'Return the detected language.' },
    temperature: { description: 'Sampling temperature.' },
    timestampGranularities: {
      description: 'Timestamp granularities to return.',
    },
    diarize: { description: 'Identify speakers in the transcription.' },
    contextBias: {
      description: 'Vocabulary and context to guide transcription.',
    },
  } satisfies Record<
    keyof MistralTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
  speech: {
    refAudio: {
      description: 'Reference audio for voice cloning, overriding voice.',
    },
    expressiveness: { description: 'Speech expressiveness, from 1 to 5.' },
    phonemeHints: { description: 'Pronunciation hints as IPA phonemes.' },
  } satisfies Record<keyof MistralSpeechModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

type ReasoningEffort = NonNullable<
  MistralLanguageModelChatOptions['reasoningEffort']
>;
type ReasoningCapabilities = {
  support: boolean;
  efforts: readonly ReasoningEffort[];
};

type LanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  reasoning: ReasoningCapabilities;
  endpoints: {
    conversation: {
      reasoning: ReasoningCapabilities;
    };
  };
};

export type MistralLanguageModelEntry = {
  capabilities: { language: LanguageCapabilities };
  providerOptions: {
    language: Record<keyof MistralLanguageModelChatOptions, ModelCapability>;
  };
};

type TranscriptionCapabilities = NonNullable<
  ModelCapabilities['transcription']
> & {
  languageWithTimestamps: boolean;
  timestamps: ModelCapability;
  diarization: ModelCapability;
  contextBias: ModelCapability;
};

type SpeechCapabilities = NonNullable<ModelCapabilities['speech']> & {
  savedVoices: ModelCapability;
  referenceAudio: ModelCapability;
  nonStreaming: boolean;
  outputFormats: readonly string[];
};

type MistralModelEntry = ModelEntry & {
  providerOptions?: {
    [Section in keyof typeof mistralProviderOptions]?: Record<
      keyof (typeof mistralProviderOptions)[Section],
      ModelCapability
    >;
  };
  capabilities: ModelCapabilities & {
    language?: LanguageCapabilities;
    transcription?: TranscriptionCapabilities;
    speech?: SpeechCapabilities;
  };
};

// Preserve the provider page's documented model set and image-input exceptions.
const documentedLanguageModels: Record<string, boolean> = {
  'labs-leanstral-1-5': true,
  'magistral-medium-latest': true,
  'magistral-small-latest': true,
  'ministral-14b-latest': true,
  'ministral-8b-latest': true,
  'mistral-large-latest': true,
  'mistral-medium-latest': true,
  'mistral-small-latest': true,
  'voxtral-small-latest': false,
  'zai-glm-5-2': false,
};

// Known non-reasoning models from https://api.mistral.ai/v1/models
// (2026-10-06). Unknown IDs inherit current reasoning configuration support.
const modelsWithoutReasoningEffort = new Set<MistralChatModelId>([
  'codestral-2508',
  'codestral-latest',
  'ministral-14b-2512',
  'ministral-14b-latest',
  'ministral-3b-2512',
  'ministral-3b-latest',
  'ministral-8b-2512',
  'ministral-8b-latest',
  'mistral-code-fim-latest',
  'mistral-code-latest',
  'mistral-large-latest',
  'mistral-large-2512',
  'voxtral-small-2507',
  'voxtral-small-latest',
]);

// GLM-5.3 models accept only low, high, and max reasoning effort and cannot
// disable reasoning. Omitting reasoning_effort uses max.
// https://docs.mistral.ai/studio/conversations/reasoning (2026-10-26)
const modelsWithLowHighMaxReasoningEffort = new Set<MistralChatModelId>([
  'zai-glm-5',
  'zai-glm-5-3',
  'zai-glm-5-3-flash',
  'zai-glm-latest',
]);

// https://api.mistral.ai/v1/models (2026-10-06)
const reasoningEffortModelIds = new Set<MistralChatModelId>([
  'glm-5-2',
  'labs-leanstral-1-5',
  'labs-leanstral-1-5-1',
  'magistral-medium-latest',
  'magistral-small-latest',
  'mistral-large-4',
  'mistral-large-4-0',
  'mistral-medium',
  'mistral-medium-2604',
  'mistral-medium-3',
  'mistral-medium-3-5',
  'mistral-medium-3.5',
  'mistral-medium-latest',
  'mistral-small-2603',
  'mistral-small-latest',
  'mistral-vibe-cli-fast',
  'mistral-vibe-cli-latest',
  'mistral-vibe-cli-with-tools',
  'zai-glm-5-2',
]);

function reasoningCapabilities(
  efforts: readonly ReasoningEffort[],
): ReasoningCapabilities {
  return { support: efforts.length > 0, efforts };
}

function createLanguageModelEntry(
  modelId: string,
  image?: boolean,
): MistralLanguageModelEntry {
  const reasoning = reasoningCapabilities(
    modelsWithoutReasoningEffort.has(modelId)
      ? []
      : modelsWithLowHighMaxReasoningEffort.has(modelId)
        ? ['low', 'high', 'max']
        : ['none', 'high'],
  );
  const conversationReasoning = reasoningCapabilities(
    reasoningEffortModelIds.has(modelId) ? ['none', 'high'] : [],
  );
  const chatOnly = { condition: 'Only supported on the Chat API.' };
  return {
    capabilities: {
      language: {
        inputs: { image: image ?? 'unknown', audio: 'unknown' },
        objectGeneration: image != null ? true : 'unknown',
        tools: {
          usage: image != null ? true : 'unknown',
          streaming: image != null ? true : 'unknown',
        },
        reasoning,
        sampling: { temperature: 'unknown', topP: 'unknown', logprobs: false },
        endpoints: { conversation: { reasoning: conversationReasoning } },
      },
    },
    providerOptions: {
      language: declareProviderOptions(
        mistralProviderOptions.language,
        image != null ? true : 'unknown',
        {
          safePrompt: chatOnly,
          documentImageLimit: chatOnly,
          documentPageLimit: chatOnly,
          parallelToolCalls: chatOnly,
          promptCacheKey: chatOnly,
          reasoningEffort:
            reasoning.support && !conversationReasoning.support
              ? chatOnly
              : reasoning.support,
        },
      ),
    },
  };
}

function createTranscriptionModelEntry(modelId: string, declared: boolean) {
  // Only these legacy IDs reject pinned language combined with timestamps.
  // Future and custom IDs keep the existing permissive request behavior.
  const languageWithTimestamps = ![
    'voxtral-mini-2507',
    'voxtral-mini-2602',
    'voxtral-mini-latest',
  ].includes(modelId);
  const support = declared ? true : 'unknown';
  const capabilities: TranscriptionCapabilities = {
    transcription: support,
    streaming: false,
    duration: support,
    segments: support,
    language: support,
    languageWithTimestamps,
    timestamps: support,
    diarization: support,
    contextBias: support,
  };
  return {
    capabilities: { transcription: capabilities },
    providerOptions: {
      transcription: declareProviderOptions(
        mistralProviderOptions.transcription,
        support,
        {
          returnLanguage: {
            condition: 'Only supported when language is not pinned.',
          },
          timestampGranularities: languageWithTimestamps
            ? support
            : {
                condition: 'Only supported when language is not pinned.',
              },
        },
      ),
    },
  };
}

function createSpeechModelEntry(declared: boolean) {
  const support = declared ? true : 'unknown';
  const capabilities: SpeechCapabilities = {
    instructions: false,
    savedVoices: support,
    referenceAudio: support,
    nonStreaming: true,
    outputFormats: ['pcm', 'wav', 'mp3', 'flac', 'opus'],
  };
  return {
    capabilities: { speech: capabilities },
    providerOptions: {
      speech: declareProviderOptions(
        mistralProviderOptions.speech,
        support,
        {},
      ),
    },
  };
}

function createEmbeddingModelEntry(
  defaultDimensions: number,
  customDimensions: boolean,
) {
  return {
    capabilities: { embedding: { defaultDimensions, customDimensions } },
    providerOptions: {
      embedding: declareProviderOptions(
        mistralProviderOptions.embedding,
        true,
        {
          outputDimension: customDimensions,
          outputDtype: customDimensions,
        },
      ),
    },
  };
}

export const mistralModelCatalog: Readonly<Record<string, MistralModelEntry>> =
  {
    ...Object.fromEntries(
      Object.entries(documentedLanguageModels).map(([modelId, image]) => [
        modelId,
        createLanguageModelEntry(modelId, image),
      ]),
    ),
    'voxtral-mini-transcribe-3-0': createTranscriptionModelEntry(
      'voxtral-mini-transcribe-3-0',
      true,
    ),
    'voxtral-small-transcribe-3-0': createTranscriptionModelEntry(
      'voxtral-small-transcribe-3-0',
      true,
    ),
    'voxtral-mini-latest': createTranscriptionModelEntry(
      'voxtral-mini-latest',
      true,
    ),
    'voxtral-mini-tts-3-0': createSpeechModelEntry(true),
    'voxtral-mini-tts-2603': createSpeechModelEntry(true),
    'mistral-embed': createEmbeddingModelEntry(1024, false),
    // https://docs.mistral.ai/studio/knowledge-rag/embeddings/code_embeddings
    'codestral-embed': createEmbeddingModelEntry(1536, true),
  };

function findModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(mistralModelCatalog, modelId)
    ? mistralModelCatalog[modelId]
    : undefined;
}

export function getMistralLanguageModelEntry(
  modelId: string,
): MistralLanguageModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.language != null &&
    entry.providerOptions?.language != null
    ? {
        capabilities: { language: entry.capabilities.language },
        providerOptions: { language: entry.providerOptions.language },
      }
    : createLanguageModelEntry(modelId);
}

export function getMistralTranscriptionModelEntry(modelId: string) {
  const capabilities = findModelEntry(modelId)?.capabilities.transcription;
  return capabilities != null
    ? { capabilities: { transcription: capabilities } }
    : createTranscriptionModelEntry(modelId, false);
}

export function getMistralSpeechModelEntry(modelId: string) {
  const capabilities = findModelEntry(modelId)?.capabilities.speech;
  return capabilities != null
    ? { capabilities: { speech: capabilities } }
    : createSpeechModelEntry(false);
}

function declareProviderOptions<Option extends string>(
  definitions: Readonly<Record<Option, ProviderOptionDefinition>>,
  support: ModelCapability,
  exceptions: Partial<Record<Option, ModelCapability>>,
): Record<Option, ModelCapability> {
  return Object.fromEntries(
    (Object.keys(definitions) as Option[]).map(option => [
      option,
      exceptions[option] ?? support,
    ]),
  ) as Record<Option, ModelCapability>;
}
