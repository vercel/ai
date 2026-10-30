import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { XaiLanguageModelResponsesOptions } from './responses/xai-responses-language-model-options';
import type { XaiImageModelOptions } from './xai-image-model-options';
import type { XaiSpeechModelOptions } from './xai-speech-model-options';
import type { XaiTranscriptionModelOptions } from './xai-transcription-model-options';

export const xaiProviderOptions = {
  language: {
    reasoningEffort: {
      description: 'Reasoning effort for configurable models.',
    },
    reasoningSummary: {
      description: 'Deprecated summary level; xAI ignores this setting.',
    },
    logprobs: { description: 'Return token log probabilities.' },
    topLogprobs: {
      description: 'Number of token log probabilities to return.',
    },
    minP: { description: 'Minimum probability sampling threshold.' },
    maxTurns: { description: 'Maximum number of agentic tool-calling turns.' },
    parallelToolCalls: { description: 'Allow parallel tool calls.' },
    promptCacheKey: {
      description: 'Cache affinity key for shared prompt prefixes.',
    },
    safetyIdentifier: {
      description: 'End-user identifier for policy violations.',
    },
    serviceTier: { description: 'Default or priority processing tier.' },
    store: { description: 'Store the input and response for later retrieval.' },
    previousResponseId: { description: 'Previous response ID to continue.' },
    user: { description: 'End-user identifier for abuse monitoring.' },
    include: { description: 'Additional output data to return.' },
  } satisfies Record<
    keyof XaiLanguageModelResponsesOptions,
    ProviderOptionDefinition
  >,
  image: {
    aspect_ratio: {
      description: 'Output aspect ratio, unless aspectRatio is provided.',
    },
    output_format: { description: 'Output image encoding.' },
    sync_mode: { description: 'Wait for image generation to complete.' },
    resolution: { description: 'Output image resolution.' },
    quality: { description: 'Output image quality.' },
    user: { description: 'End-user identifier.' },
  } satisfies Record<keyof XaiImageModelOptions, ProviderOptionDefinition>,
  speech: {
    sampleRate: { description: 'Output audio sample rate.' },
    bitRate: { description: 'MP3 output bit rate.' },
    optimizeStreamingLatency: {
      description: 'Trade quality for lower latency.',
    },
    textNormalization: {
      description: 'Normalize written text before synthesis.',
    },
    withTimestamps: {
      description: 'Return character timings and audio duration.',
    },
    replace: { description: 'Spoken substitutions and pronunciation hints.' },
  } satisfies Record<keyof XaiSpeechModelOptions, ProviderOptionDefinition>,
  transcription: {
    audioFormat: { description: 'Encoding of raw input audio.' },
    sampleRate: { description: 'Input audio sample rate.' },
    language: { description: 'Language for inverse text normalization.' },
    format: { description: 'Enable inverse text normalization.' },
    multichannel: { description: 'Transcribe each audio channel separately.' },
    channels: { description: 'Number of interleaved input audio channels.' },
    diarize: { description: 'Enable speaker diarization.' },
    keyterm: { description: 'Terms to bias transcription toward.' },
    fillerWords: { description: 'Include filler words in the transcript.' },
    vadThreshold: { description: 'Voice activity detection threshold.' },
    streaming: { description: 'WebSocket streaming transcription settings.' },
  } satisfies Record<
    keyof XaiTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

type XaiReasoningEffort = NonNullable<
  XaiLanguageModelResponsesOptions['reasoningEffort']
>;
type LanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  reasoning: {
    support: ModelCapability;
    efforts?: readonly XaiReasoningEffort[];
    /** Preserve the existing SDK portable-reasoning policy independently of native support. */
    portable: {
      configurable: boolean;
      none: boolean;
      xhigh: boolean;
    };
  };
};
type ImageCapabilities = NonNullable<ModelCapabilities['image']> & {
  maxImagesPerCall: number;
  resolutions?: readonly string[];
  aspectRatios?: readonly string[];
};
type SpeechCapabilities = NonNullable<ModelCapabilities['speech']> & {
  language: boolean;
  speed: boolean;
  outputFormats: readonly string[];
};
type TranscriptionCapabilities = NonNullable<
  ModelCapabilities['transcription']
> & {
  wordTimestamps: ModelCapability;
  diarization: ModelCapability;
  multichannel: ModelCapability;
};
type XaiRequestConfig = {
  speech?: { voice: string; language: string; outputFormat: string };
  transcription?: { model: string | undefined };
};
type XaiModelEntry = ModelEntry<XaiRequestConfig> & {
  capabilities: ModelCapabilities & {
    language?: LanguageCapabilities;
    image?: ImageCapabilities;
    speech?: SpeechCapabilities;
    transcription?: TranscriptionCapabilities;
  };
  providerOptions?: {
    [Section in keyof typeof xaiProviderOptions]?: Record<
      keyof (typeof xaiProviderOptions)[Section],
      ModelCapability
    >;
  };
};

type LanguageDefinition = {
  image: boolean;
  reasoning: boolean;
  efforts?: readonly XaiReasoningEffort[];
};

// Preserve the model capabilities already declared in the provider page and
// shared overview. This migration does not reinterpret retired model aliases.
const languageDefinitions: Record<string, LanguageDefinition> = {
  'grok-4.7': {
    image: true,
    reasoning: true,
    efforts: ['low', 'medium', 'high', 'xhigh'],
  },
  'grok-4.6': {
    image: true,
    reasoning: true,
    efforts: ['low', 'medium', 'high', 'xhigh'],
  },
  'grok-4.5': {
    image: true,
    reasoning: true,
    efforts: ['low', 'medium', 'high'],
  },
  'grok-4.20-reasoning': { image: true, reasoning: true },
  'grok-4.20-non-reasoning': { image: true, reasoning: false },
  'grok-4-1-fast-reasoning': { image: true, reasoning: true },
  'grok-4-1-fast-non-reasoning': { image: true, reasoning: false },
  'grok-4-1': { image: false, reasoning: false },
  'grok-4-fast-reasoning': { image: true, reasoning: true },
  'grok-4-fast-non-reasoning': { image: true, reasoning: false },
  'grok-code-fast-1': { image: false, reasoning: true },
  'grok-4': { image: false, reasoning: true },
  'grok-3': { image: false, reasoning: false },
  'grok-3-mini': { image: false, reasoning: true },
};

// These variants reject reasoning effort, including `none`. Multi-agent
// variants deliberately retain the existing configurable-effort fallback.
const modelsWithoutReasoningEffort = /^grok-4\.20(-\d{4})?-(non-)?reasoning$/;
// 4.20 predates 4.5 despite its version number. Preserve this distinction.
const modelsWithoutNoneReasoningEffort =
  /^grok-(?:4\.[5-9](?!\d)|(?:[5-9]|[1-9]\d+)(?:[.-]|$))/;

function createLanguageModelEntry(
  modelId: string,
  definition?: LanguageDefinition,
) {
  const configurable = !modelsWithoutReasoningEffort.test(modelId);
  const language: LanguageCapabilities = {
    inputs: { image: definition?.image ?? 'unknown', audio: 'unknown' },
    objectGeneration: definition != null ? true : 'unknown',
    tools: {
      usage: definition != null ? true : 'unknown',
      streaming: definition != null ? true : 'unknown',
    },
    reasoning: {
      support: definition?.reasoning ?? 'unknown',
      efforts: definition?.efforts,
      portable: {
        configurable,
        none: !modelsWithoutNoneReasoningEffort.test(modelId),
        // Keep the existing exact-ID exception. Native Grok 4.7 accepts xhigh,
        // but portable reasoning currently maps it to high on that model.
        xhigh: modelId === 'grok-4.6',
      },
    },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  };
  return {
    capabilities: { language },
    providerOptions: {
      language: declareProviderOptions(
        xaiProviderOptions.language,
        definition != null ? true : 'unknown',
        {
          reasoningEffort: !configurable
            ? false
            : definition != null
              ? true
              : 'unknown',
          reasoningSummary: false,
        },
      ),
    },
  };
}

const commonAspectRatios = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '2:1',
  '1:2',
  '19.5:9',
  '9:19.5',
  '20:9',
  '9:20',
];

function createImageModelEntry(definition?: {
  resolutions: readonly string[];
  aspectRatios: readonly string[];
  quality: ModelCapability;
}) {
  const image: ImageCapabilities = {
    sizes: {
      description:
        'Use aspectRatio and providerOptions.xai.resolution instead of size.',
    },
    fileInput: definition != null ? true : 'unknown',
    maskInput: definition != null ? false : 'unknown',
    maxImagesPerCall: 3,
    resolutions: definition?.resolutions,
    aspectRatios: definition?.aspectRatios,
  };
  return {
    capabilities: { image },
    providerOptions: {
      image: declareProviderOptions(
        xaiProviderOptions.image,
        definition != null ? true : 'unknown',
        {
          quality: definition?.quality ?? 'unknown',
        },
      ),
    },
  };
}

const defaultSpeechModelEntry = {
  capabilities: {
    speech: {
      instructions: false,
      language: true,
      speed: true,
      outputFormats: ['mp3', 'wav', 'pcm', 'mulaw', 'alaw'],
    } satisfies SpeechCapabilities,
  },
  providerOptions: {
    speech: declareProviderOptions(xaiProviderOptions.speech, true, {
      bitRate: { condition: 'Only supported for MP3 output.' },
    }),
  },
  requestConfig: {
    speech: { voice: 'eve', language: 'auto', outputFormat: 'mp3' },
  },
};

function createTranscriptionModelEntry(modelId: string, declared: boolean) {
  const support = declared ? true : 'unknown';
  const transcription: TranscriptionCapabilities = {
    transcription: support,
    streaming: support,
    duration: support,
    segments: support,
    language: support,
    wordTimestamps: support,
    diarization: support,
    multichannel: support,
  };
  return {
    capabilities: { transcription },
    providerOptions: {
      transcription: declareProviderOptions(
        xaiProviderOptions.transcription,
        support,
        {
          audioFormat: {
            condition:
              'Opus encoding is supported for streaming requests only.',
          },
          format: {
            condition:
              'Requires language and a request/response transcription request.',
          },
          streaming: {
            condition: 'Only supported for streaming transcription.',
          },
        },
      ),
    },
    requestConfig: { transcription: { model: modelId || undefined } },
  };
}

const defaultTranscriptionModelEntry = createTranscriptionModelEntry('', true);

export const xaiModelCatalog: Readonly<Record<string, XaiModelEntry>> = {
  ...Object.fromEntries(
    Object.entries(languageDefinitions).map(([modelId, definition]) => [
      modelId,
      createLanguageModelEntry(modelId, definition),
    ]),
  ),
  'grok-imagine-image-2.0': createImageModelEntry({
    resolutions: ['1k', '1.5k', '2k'],
    aspectRatios: [...commonAspectRatios, '21:9', '5:2', 'auto'],
    quality: true,
  }),
  'grok-imagine-image-pro': createImageModelEntry({
    resolutions: ['1k', '1.5k', '2k'],
    aspectRatios: [...commonAspectRatios, 'auto'],
    quality: 'unknown',
  }),
  'grok-imagine-image': createImageModelEntry({
    resolutions: ['1k'],
    aspectRatios: [...commonAspectRatios, 'auto'],
    quality: 'unknown',
  }),
  // The factories use the empty model ID for both default speech and default
  // transcription. Keep one record containing both independent operations.
  '': {
    capabilities: {
      ...defaultSpeechModelEntry.capabilities,
      ...defaultTranscriptionModelEntry.capabilities,
    },
    providerOptions: {
      ...defaultSpeechModelEntry.providerOptions,
      ...defaultTranscriptionModelEntry.providerOptions,
    },
    requestConfig: {
      ...defaultSpeechModelEntry.requestConfig,
      ...defaultTranscriptionModelEntry.requestConfig,
    },
  },
  'grok-voice-transcribe-2.0': createTranscriptionModelEntry(
    'grok-voice-transcribe-2.0',
    true,
  ),
  'grok-voice-latest': {
    capabilities: {
      realtime: {
        conversation: 'turn-based',
        transports: ['websocket'],
        connections: ['client-secret-websocket'],
      },
    },
  },
};

function findModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(xaiModelCatalog, modelId)
    ? xaiModelCatalog[modelId]
    : undefined;
}

export function getXaiLanguageModelEntry(modelId: string) {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.language != null &&
    entry.providerOptions?.language != null
    ? {
        capabilities: { language: entry.capabilities.language },
        providerOptions: { language: entry.providerOptions.language },
      }
    : createLanguageModelEntry(modelId);
}

export function getXaiImageModelEntry(modelId: string) {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.image != null &&
    entry.providerOptions?.image != null
    ? {
        capabilities: { image: entry.capabilities.image },
        providerOptions: { image: entry.providerOptions.image },
      }
    : createImageModelEntry();
}

export function getXaiSpeechModelEntry() {
  return defaultSpeechModelEntry;
}

export function getXaiTranscriptionModelEntry(modelId: string) {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.transcription != null &&
    entry.providerOptions?.transcription != null &&
    entry.requestConfig?.transcription != null
    ? {
        capabilities: { transcription: entry.capabilities.transcription },
        providerOptions: { transcription: entry.providerOptions.transcription },
        requestConfig: { transcription: entry.requestConfig.transcription },
      }
    : createTranscriptionModelEntry(modelId, false);
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
