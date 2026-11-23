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

/**
 * One row of the language model matrix. Every capability that differs between
 * models is its own column, and every listed model fills in every column.
 * Nothing is derived from the model ID or from another column.
 */
export type XaiLanguageModelRow = {
  /**
   * `false` keeps a known model ID out of the exported catalog and the
   * generated documentation. Its object generation, tools, and provider
   * options are then reported as `'unknown'`.
   */
  documented: boolean;
  image: ModelCapability;
  /** Native reasoning support. */
  reasoning: ModelCapability;
  /** Native reasoning efforts. `undefined` means no exhaustive list. */
  reasoningEfforts: readonly XaiReasoningEffort[] | undefined;
  /** The SDK sends portable reasoning as a reasoning effort. */
  portableReasoningEffort: boolean;
  /** Portable reasoning `none` is sent as is. */
  portableReasoningNone: boolean;
  /** Portable reasoning `xhigh` is sent as is instead of mapping to `high`. */
  portableReasoningXhigh: boolean;
};

/**
 * Language model matrix: model IDs by capability. To add a model, add a row and
 * fill in every column.
 */
const languageModelDefinitions = {
  'grok-4.7': {
    documented: true,
    image: true,
    reasoning: true,
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    portableReasoningEffort: true,
    portableReasoningNone: false,
    portableReasoningXhigh: false,
  },
  'grok-4.6': {
    documented: true,
    image: true,
    reasoning: true,
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    portableReasoningEffort: true,
    portableReasoningNone: false,
    portableReasoningXhigh: true,
  },
  'grok-4.5': {
    documented: true,
    image: true,
    reasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    portableReasoningEffort: true,
    portableReasoningNone: false,
    portableReasoningXhigh: false,
  },
  'grok-4.20-reasoning': {
    documented: true,
    image: true,
    reasoning: true,
    reasoningEfforts: undefined,
    portableReasoningEffort: false,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-4.20-non-reasoning': {
    documented: true,
    image: true,
    reasoning: false,
    reasoningEfforts: undefined,
    portableReasoningEffort: false,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-4-1-fast-reasoning': {
    documented: true,
    image: true,
    reasoning: true,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-4-1-fast-non-reasoning': {
    documented: true,
    image: true,
    reasoning: false,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-4-1': {
    documented: true,
    image: false,
    reasoning: false,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-4-fast-reasoning': {
    documented: true,
    image: true,
    reasoning: true,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-4-fast-non-reasoning': {
    documented: true,
    image: true,
    reasoning: false,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-code-fast-1': {
    documented: true,
    image: false,
    reasoning: true,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-4': {
    documented: true,
    image: false,
    reasoning: true,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-3': {
    documented: true,
    image: false,
    reasoning: false,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-3-mini': {
    documented: true,
    image: false,
    reasoning: true,
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-4.3': {
    documented: false,
    image: 'unknown',
    reasoning: 'unknown',
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
  'grok-latest': {
    documented: false,
    image: 'unknown',
    reasoning: 'unknown',
    reasoningEfforts: undefined,
    portableReasoningEffort: true,
    portableReasoningNone: true,
    portableReasoningXhigh: false,
  },
} satisfies Record<string, XaiLanguageModelRow>;

function createLanguageModelEntry(row: XaiLanguageModelRow) {
  const documentedSupport: ModelCapability = row.documented ? true : 'unknown';
  const language: LanguageCapabilities = {
    inputs: { image: row.image, audio: 'unknown' },
    objectGeneration: documentedSupport,
    tools: {
      usage: documentedSupport,
      streaming: documentedSupport,
    },
    reasoning: {
      support: row.reasoning,
      efforts: row.reasoningEfforts,
      portable: {
        configurable: row.portableReasoningEffort,
        none: row.portableReasoningNone,
        xhigh: row.portableReasoningXhigh,
      },
    },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  };
  return {
    capabilities: { language },
    providerOptions: {
      language: declareProviderOptions(
        xaiProviderOptions.language,
        documentedSupport,
        {
          reasoningEffort: row.portableReasoningEffort
            ? documentedSupport
            : false,
          reasoningSummary: false,
        },
      ),
    },
  };
}

const languageModelRows = Object.entries<XaiLanguageModelRow>(
  languageModelDefinitions,
);

/** Entries for every listed model ID, documented or not. */
const listedLanguageModelEntries = Object.fromEntries(
  languageModelRows.map(([modelId, row]) => [
    modelId,
    createLanguageModelEntry(row),
  ]),
);

// Family rules, used only for model IDs that are not listed in the matrix.
// These 4.20 variants reject reasoning effort, including `none`. Multi-agent
// variants deliberately retain the configurable-effort fallback.
const unlistedModelsWithoutReasoningEffort =
  /^grok-4\.20(-\d{4})?-(non-)?reasoning$/;
// 4.20 predates 4.5 despite its version number.
const unlistedModelsWithoutNoneReasoningEffort =
  /^grok-(?:4\.[5-9](?!\d)|(?:[5-9]|[1-9]\d+)(?:[.-]|$))/;

/** Resolves a model ID that is not listed in the matrix to a row. */
function getUnlistedModelRow(modelId: string): XaiLanguageModelRow {
  return {
    documented: false,
    image: 'unknown',
    reasoning: 'unknown',
    reasoningEfforts: undefined,
    portableReasoningEffort:
      !unlistedModelsWithoutReasoningEffort.test(modelId),
    portableReasoningNone:
      !unlistedModelsWithoutNoneReasoningEffort.test(modelId),
    portableReasoningXhigh: false,
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

const xaiImageModelEntries = {
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
};

const xaiTranscriptionModelEntries = {
  'grok-voice-transcribe-2.0': createTranscriptionModelEntry(
    'grok-voice-transcribe-2.0',
    true,
  ),
};

const xaiRealtimeModelEntries = {
  'grok-voice-latest': {
    capabilities: {
      realtime: {
        conversation: 'turn-based',
        transports: ['websocket'],
        connections: ['client-secret-websocket', 'server-websocket'],
      },
    },
  },
} satisfies Record<string, XaiModelEntry>;

const videoModelIds = ['grok-imagine-video', 'grok-imagine-video-1.5'] as const;

export const xaiDefaultAudioModelId = '';

export const xaiModelCatalog: Readonly<Record<string, XaiModelEntry>> = {
  ...Object.fromEntries(
    languageModelRows
      .filter(([, row]) => row.documented)
      .map(([modelId]) => [modelId, listedLanguageModelEntries[modelId]]),
  ),
  ...xaiImageModelEntries,

  // The factories use the empty model ID for both default speech and default
  // transcription. Keep one record containing both independent operations.
  [xaiDefaultAudioModelId]: {
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
  ...xaiTranscriptionModelEntries,
  ...xaiRealtimeModelEntries,
};

function findModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(xaiModelCatalog, modelId)
    ? xaiModelCatalog[modelId]
    : undefined;
}

export function getXaiLanguageModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(
    listedLanguageModelEntries,
    modelId,
  )
    ? listedLanguageModelEntries[modelId]
    : createLanguageModelEntry(getUnlistedModelRow(modelId));
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

/** Known model IDs, derived from the declarations used to build the catalog. */
export type XaiModelIds = {
  video: (typeof videoModelIds)[number];
  speech: typeof xaiDefaultAudioModelId;
  language: keyof typeof languageModelDefinitions;
  image: keyof typeof xaiImageModelEntries;
  transcription: keyof typeof xaiTranscriptionModelEntries;
  realtime: keyof typeof xaiRealtimeModelEntries;
};
