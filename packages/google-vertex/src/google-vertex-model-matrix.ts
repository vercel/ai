import type { ModelCapability } from '@ai-sdk/provider';

export type VertexRequestConfig = {
  language?: { endpoint: boolean; maxOutputTokens?: number };
  image?: { gemini: boolean };
  embedding?: {
    endpoint: 'embedContent' | 'predict';
    maxEmbeddingsPerCall: number;
  };
  speech?: { api: 'cloud-tts' | 'gemini' };
  transcription?: { api: 'gemini' | 'cloud-speech'; live: boolean };
};

/*
 * The model matrices of the Vertex AI provider: for every operation, the row
 * type and the matrix (model IDs by capability). The builders that turn a row
 * into a catalog entry are in `google-vertex-model-catalog.ts`.
 *
 * A row is flat and every listed model fills in every cell. Nothing in a row
 * is derived from the model ID. Facts that depend on each other share one
 * cell, so a row cannot contradict itself.
 *
 * Model IDs that are not listed are resolved at the end of the file, which is
 * the only place that looks at the model ID.
 */

// Language models (Gemini)

/**
 * One row of the Gemini language model matrix. A Gemini model on Vertex AI
 * extends a model of the Google provider: the row names that model, and the
 * builder applies the Vertex AI restrictions on top of its capabilities.
 */
export type GoogleVertexLanguageModelRow = {
  /** Model ID in the `@ai-sdk/google` catalog that this model extends. */
  googleModelId: string;
};

export const languageModelDefinitions = {
  'gemini-nano-banana-2.1': { googleModelId: 'gemini-nano-banana-2.1' },
  'gemini-4-argon': { googleModelId: 'gemini-4-argon' },
  'gemini-4-carbon': { googleModelId: 'gemini-4-carbon' },
  'gemini-4-hydrogen': { googleModelId: 'gemini-4-hydrogen' },
  'gemini-4-neon': { googleModelId: 'gemini-4-neon' },
  'gemini-3.8-flash': { googleModelId: 'gemini-3.8-flash' },
  'gemini-3.7-flash': { googleModelId: 'gemini-3.7-flash' },
  'gemini-3.6-flash': { googleModelId: 'gemini-3.6-flash' },
  'gemini-3.5-flash': { googleModelId: 'gemini-3.5-flash' },
  'gemini-3.5-flash-lite': { googleModelId: 'gemini-3.5-flash-lite' },
  'gemini-2.5-pro': { googleModelId: 'gemini-2.5-pro' },
  'gemini-2.5-flash': { googleModelId: 'gemini-2.5-flash' },
  'gemini-2.5-flash-lite': { googleModelId: 'gemini-2.5-flash-lite' },
  'gemini-2.0-flash-lite': { googleModelId: 'gemini-2.0-flash-lite' },
  'gemini-2.0-flash': { googleModelId: 'gemini-2.0-flash' },
  'gemini-2.0-flash-001': { googleModelId: 'gemini-2.0-flash-001' },
  'gemini-1.5-flash': { googleModelId: 'gemini-1.5-flash' },
  'gemini-1.5-flash-001': { googleModelId: 'gemini-1.5-flash-001' },
  'gemini-1.5-flash-002': { googleModelId: 'gemini-1.5-flash-002' },
  'gemini-1.5-pro': { googleModelId: 'gemini-1.5-pro' },
  'gemini-1.5-pro-001': { googleModelId: 'gemini-1.5-pro-001' },
  'gemini-1.5-pro-002': { googleModelId: 'gemini-1.5-pro-002' },
  'gemini-1.0-pro-001': { googleModelId: 'gemini-1.0-pro-001' },
  'gemini-1.0-pro-vision-001': { googleModelId: 'gemini-1.0-pro-vision-001' },
  'gemini-1.0-pro': { googleModelId: 'gemini-1.0-pro' },
  'gemini-1.0-pro-002': { googleModelId: 'gemini-1.0-pro-002' },
  'gemini-2.0-flash-lite-preview-02-05': {
    googleModelId: 'gemini-2.0-flash-lite-preview-02-05',
  },
  'gemini-2.5-flash-preview-09-2025': {
    googleModelId: 'gemini-2.5-flash-preview-09-2025',
  },
  'gemini-3-pro-preview': { googleModelId: 'gemini-3-pro-preview' },
  'gemini-3-pro-image-preview': { googleModelId: 'gemini-3-pro-image-preview' },
  'gemini-3-flash-preview': { googleModelId: 'gemini-3-flash-preview' },
  'gemini-3.1-pro-preview': { googleModelId: 'gemini-3.1-pro-preview' },
  'gemini-3.1-flash-image-preview': {
    googleModelId: 'gemini-3.1-flash-image-preview',
  },
  'gemini-3.1-flash-lite-preview': {
    googleModelId: 'gemini-3.1-flash-lite-preview',
  },
  'gemini-2.0-pro-exp-02-05': { googleModelId: 'gemini-2.0-pro-exp-02-05' },
  'gemini-2.0-flash-exp': { googleModelId: 'gemini-2.0-flash-exp' },
} satisfies Record<string, GoogleVertexLanguageModelRow>;

/** Listed Gemini models are called by model ID, not through an endpoint. */
export const listedLanguageRequestConfig: VertexRequestConfig['language'] = {
  endpoint: false,
  maxOutputTokens: undefined,
};

// Image models

export type GoogleVertexImageModelRow = {
  /**
   * `false`: nothing is documented for the model ID. File and mask input are
   * then reported as `'unknown'`.
   */
  documented: boolean;
  /** API that generates the image. */
  api: 'gemini' | 'imagen';
  aspectRatios: readonly string[];
};

export const imageModelDefinitions = {
  'gemini-2.5-flash-image': {
    documented: true,
    api: 'gemini',
    aspectRatios: [
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ],
  },
  'gemini-3-pro-image-preview': {
    documented: true,
    api: 'gemini',
    aspectRatios: [
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ],
  },
  'gemini-3.1-flash-image-preview': {
    documented: true,
    api: 'gemini',
    aspectRatios: [
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ],
  },
  'gemini-nano-banana-2.1': {
    documented: true,
    api: 'gemini',
    aspectRatios: [
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
      '1:8',
      '8:1',
      '1:4',
      '4:1',
    ],
  },
} satisfies Record<string, GoogleVertexImageModelRow>;

// Embedding models

export type GoogleVertexEmbeddingModelRow = {
  endpoint: 'embedContent' | 'predict';
  maxEmbeddingsPerCall: number;
  multimodal: boolean;
  defaultDimensions: number;
};

export const embeddingModelDefinitions = {
  'textembedding-gecko': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 768,
  },
  'textembedding-gecko@001': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 768,
  },
  'textembedding-gecko@003': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 768,
  },
  'textembedding-gecko-multilingual': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 768,
  },
  'textembedding-gecko-multilingual@001': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 768,
  },
  'text-multilingual-embedding-002': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 768,
  },
  'text-embedding-004': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 768,
  },
  'text-embedding-005': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 768,
  },
  'gemini-embedding-001': {
    endpoint: 'predict',
    maxEmbeddingsPerCall: 250,
    multimodal: false,
    defaultDimensions: 3072,
  },
  'gemini-embedding-2': {
    endpoint: 'embedContent',
    maxEmbeddingsPerCall: 1,
    multimodal: true,
    defaultDimensions: 3072,
  },
  'gemini-embedding-2-preview': {
    endpoint: 'embedContent',
    maxEmbeddingsPerCall: 1,
    multimodal: true,
    defaultDimensions: 3072,
  },
} satisfies Record<string, GoogleVertexEmbeddingModelRow>;

/** Request settings for embedding model IDs that are not listed. */
const unlistedEmbeddingModel: Pick<
  GoogleVertexEmbeddingModelRow,
  'endpoint' | 'maxEmbeddingsPerCall'
> = { endpoint: 'predict', maxEmbeddingsPerCall: 250 };

// Video models

export type GoogleVertexVideoModelRow = {
  generateAudio: boolean;
};

export const videoModelDefinitions = {
  'veo-2.0-generate-preview': { generateAudio: false },
  'veo-2.0-generate-exp': { generateAudio: false },
  'veo-2.0-generate-001': { generateAudio: false },
  'veo-3.0-generate-001': { generateAudio: true },
  'veo-3.0-fast-generate-001': { generateAudio: true },
  'veo-3.0-generate-preview': { generateAudio: true },
  'veo-3.0-fast-generate-preview': { generateAudio: true },
  'veo-3.1-generate-001': { generateAudio: true },
  'veo-3.1-fast-generate-001': { generateAudio: true },
  'veo-3.1-generate-preview': { generateAudio: true },
  'veo-3.1-fast-generate-preview': { generateAudio: true },
} satisfies Record<string, GoogleVertexVideoModelRow>;

// Speech models

const requiresGemini38Tts = { condition: 'Requires Gemini 3.8 TTS.' } as const;

export type GoogleVertexSpeechModelRow = {
  /** API that synthesizes the speech. */
  api: 'cloud-tts' | 'gemini';
  instructions: boolean;
  /** Multi-speaker output, set with `multiSpeakerVoiceConfig`. */
  multiSpeaker: boolean;
  speechMetadata: ModelCapability;
  turns: ModelCapability;
};

export const speechModelDefinitions = {
  'gemini-2.5-flash-tts': {
    api: 'gemini',
    instructions: true,
    multiSpeaker: true,
    speechMetadata: requiresGemini38Tts,
    turns: requiresGemini38Tts,
  },
  'gemini-2.5-pro-tts': {
    api: 'gemini',
    instructions: true,
    multiSpeaker: true,
    speechMetadata: requiresGemini38Tts,
    turns: requiresGemini38Tts,
  },
  'gemini-2.5-flash-lite-preview-tts': {
    api: 'gemini',
    instructions: true,
    multiSpeaker: true,
    speechMetadata: requiresGemini38Tts,
    turns: requiresGemini38Tts,
  },
  'gemini-3.1-flash-tts-preview': {
    api: 'gemini',
    instructions: true,
    multiSpeaker: true,
    speechMetadata: requiresGemini38Tts,
    turns: requiresGemini38Tts,
  },
  'chirp-3-hd': {
    api: 'cloud-tts',
    instructions: false,
    multiSpeaker: false,
    speechMetadata: false,
    turns: false,
  },
} satisfies Record<string, GoogleVertexSpeechModelRow>;

// Transcription models

const requiresWordTimestamps = {
  condition: 'Requires word timestamps.',
} as const;

export type GoogleVertexTranscriptionModelRow = {
  /**
   * API that transcribes the audio. It also decides which provider options
   * apply, because each API has its own.
   */
  api: 'cloud-speech' | 'gemini';
  /** `batch` transcribes a complete file. `live` transcribes a stream. */
  mode: 'batch' | 'live';
  duration: boolean;
  segments: ModelCapability;
  /** Documented word timestamp support. `undefined`: not documented. */
  wordTimestamps: string | undefined;
  /** Documented language detection. `undefined`: not documented. */
  languageDetection: string | undefined;
};

export const transcriptionModelDefinitions = {
  chirp_2: {
    api: 'cloud-speech',
    mode: 'batch',
    duration: true,
    segments: requiresWordTimestamps,
    wordTimestamps: 'Available with a potential quality and speed tradeoff',
    languageDetection: "Auto detection with `['auto']`",
  },
  chirp_3: {
    api: 'cloud-speech',
    mode: 'batch',
    duration: true,
    segments: requiresWordTimestamps,
    wordTimestamps: 'Available with a potential transcription quality tradeoff',
    languageDetection: "Auto detection with `['auto']`",
  },
  telephony: {
    api: 'cloud-speech',
    mode: 'batch',
    duration: true,
    segments: requiresWordTimestamps,
    wordTimestamps: 'Available',
    languageDetection:
      'Explicit supported language codes, with alternative language detection support',
  },
  'gemini-3.5-transcribe': {
    api: 'gemini',
    mode: 'batch',
    duration: false,
    segments: requiresWordTimestamps,
    wordTimestamps: undefined,
    languageDetection: undefined,
  },
  'gemini-3.5-transcribe-live': {
    api: 'gemini',
    mode: 'live',
    duration: false,
    segments: false,
    wordTimestamps: undefined,
    languageDetection: undefined,
  },
} satisfies Record<string, GoogleVertexTranscriptionModelRow>;

// Anthropic models on Vertex AI

export type GoogleVertexAnthropicModelRow = {
  /**
   * `false` keeps a known model ID out of the exported catalog and the
   * generated documentation.
   */
  documented: boolean;
  image: ModelCapability;
  objectGeneration: ModelCapability;
  tools: ModelCapability;
  toolStreaming: ModelCapability;
  computerUse: ModelCapability;
};

export const anthropicModelDefinitions = {
  'claude-fable-5-1': {
    documented: true,
    image: true,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: true,
  },
  'claude-fable-5-2': {
    documented: true,
    image: true,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: true,
  },
  'claude-3-7-sonnet@20250219': {
    documented: true,
    image: true,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: true,
  },
  'claude-3-5-sonnet-v2@20241022': {
    documented: true,
    image: true,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: true,
  },
  'claude-3-5-sonnet@20240620': {
    documented: true,
    image: true,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: false,
  },
  'claude-3-5-haiku@20241022': {
    documented: true,
    image: false,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: false,
  },
  'claude-3-sonnet@20240229': {
    documented: true,
    image: true,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: false,
  },
  'claude-3-haiku@20240307': {
    documented: true,
    image: true,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: false,
  },
  'claude-3-opus@20240229': {
    documented: true,
    image: true,
    objectGeneration: true,
    tools: true,
    toolStreaming: true,
    computerUse: false,
  },
  'claude-fable-5': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-haiku-5-5': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-opus-4-1@20250805': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-opus-4-5@20251101': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-opus-4-6': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-opus-4-7': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-opus-4-8': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-opus-4@20250514': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-opus-5': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-opus-5-5': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-sonnet-4-5@20250929': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-sonnet-4-6': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-sonnet-4@20250514': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-sonnet-5': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
  'claude-sonnet-5-5': {
    documented: false,
    image: 'unknown',
    objectGeneration: 'unknown',
    tools: 'unknown',
    toolStreaming: 'unknown',
    computerUse: 'unknown',
  },
} satisfies Record<string, GoogleVertexAnthropicModelRow>;

// xAI models on Vertex AI

export type GoogleVertexXaiModelRow = {
  reasoning: boolean;
};

export const xaiModelDefinitions = {
  'xai/grok-4.20-reasoning': { reasoning: true },
  'xai/grok-4.20-non-reasoning': { reasoning: false },
  'xai/grok-4.1-fast-reasoning': { reasoning: true },
  'xai/grok-4.1-fast-non-reasoning': { reasoning: false },
} satisfies Record<string, GoogleVertexXaiModelRow>;

// Model as a Service (MaaS) models on Vertex AI

export type GoogleVertexMaasModelRow = {
  publisher: string;
  /**
   * Output token limit that the SDK applies to requests. `undefined`: no
   * limit is applied.
   */
  maxOutputTokens: number | undefined;
};

export const maasModelDefinitions = {
  'deepseek-ai/deepseek-r1-0528-maas': {
    publisher: 'DeepSeek',
    maxOutputTokens: undefined,
  },
  'deepseek-ai/deepseek-v3.1-maas': {
    publisher: 'DeepSeek',
    maxOutputTokens: undefined,
  },
  'deepseek-ai/deepseek-v3.2-maas': {
    publisher: 'DeepSeek',
    maxOutputTokens: undefined,
  },
  'openai/gpt-oss-120b-maas': {
    publisher: 'OpenAI',
    maxOutputTokens: undefined,
  },
  'openai/gpt-oss-20b-maas': {
    publisher: 'OpenAI',
    maxOutputTokens: undefined,
  },
  'meta/llama-4-maverick-17b-128e-instruct-maas': {
    publisher: 'Meta',
    maxOutputTokens: 8192,
  },
  'meta/llama-4-scout-17b-16e-instruct-maas': {
    publisher: 'Meta',
    maxOutputTokens: 8192,
  },
  'minimax/minimax-m2-maas': {
    publisher: 'MiniMax',
    maxOutputTokens: undefined,
  },
  'qwen/qwen3-coder-480b-a35b-instruct-maas': {
    publisher: 'Qwen',
    maxOutputTokens: undefined,
  },
  'qwen/qwen3-next-80b-a3b-instruct-maas': {
    publisher: 'Qwen',
    maxOutputTokens: undefined,
  },
  'qwen/qwen3-next-80b-a3b-thinking-maas': {
    publisher: 'Qwen',
    maxOutputTokens: undefined,
  },
  'moonshotai/kimi-k2-thinking-maas': {
    publisher: 'Moonshot',
    maxOutputTokens: undefined,
  },
} satisfies Record<string, GoogleVertexMaasModelRow>;

// Lookup by model ID

/**
 * Request settings for a model ID, per operation. A listed model ID uses its
 * row. Every other model ID uses the fallback for unlisted IDs.
 */
export function getGoogleVertexRequestConfig(
  modelId: string,
): VertexRequestConfig {
  const maas = findRow<GoogleVertexMaasModelRow>(maasModelDefinitions, modelId);
  const image =
    findRow<GoogleVertexImageModelRow>(imageModelDefinitions, modelId) ??
    getUnlistedImageModelRow(modelId);
  const embedding =
    findRow<GoogleVertexEmbeddingModelRow>(
      embeddingModelDefinitions,
      modelId,
    ) ?? unlistedEmbeddingModel;
  const speech = findRow<GoogleVertexSpeechModelRow>(
    speechModelDefinitions,
    modelId,
  );
  const transcription = findRow<GoogleVertexTranscriptionModelRow>(
    transcriptionModelDefinitions,
    modelId,
  );

  return {
    language:
      maas != null
        ? { endpoint: false, maxOutputTokens: maas.maxOutputTokens }
        : findRow(languageModelDefinitions, modelId) != null
          ? listedLanguageRequestConfig
          : getUnlistedLanguageRequestConfig(modelId),
    image: { gemini: image.api === 'gemini' },
    embedding: {
      endpoint: embedding.endpoint,
      maxEmbeddingsPerCall: embedding.maxEmbeddingsPerCall,
    },
    speech: { api: speech?.api ?? getUnlistedSpeechApi(modelId) },
    transcription:
      transcription != null
        ? { api: transcription.api, live: transcription.mode === 'live' }
        : getUnlistedTranscriptionRequestConfig(modelId),
  };
}

export function findRow<Row>(
  definitions: Readonly<Record<string, Row>>,
  modelId: string,
): Row | undefined {
  return Object.prototype.hasOwnProperty.call(definitions, modelId)
    ? definitions[modelId]
    : undefined;
}

/*
 * Fallback for model IDs that are not listed in a matrix, such as new models,
 * tuned models, and endpoints. This is the only place that derives anything
 * from the model ID, so that new models keep working before they are listed.
 */

function getUnlistedLanguageRequestConfig(
  modelId: string,
): VertexRequestConfig['language'] {
  return {
    endpoint: modelId.startsWith('endpoints/'),
    maxOutputTokens: undefined,
  };
}

export function getUnlistedImageModelRow(
  modelId: string,
): GoogleVertexImageModelRow {
  return {
    documented: false,
    api: modelId.startsWith('gemini-') ? 'gemini' : 'imagen',
    aspectRatios: [],
  };
}

function getUnlistedSpeechApi(
  modelId: string,
): GoogleVertexSpeechModelRow['api'] {
  return modelId.startsWith('chirp') ? 'cloud-tts' : 'gemini';
}

function getUnlistedTranscriptionRequestConfig(
  modelId: string,
): NonNullable<VertexRequestConfig['transcription']> {
  return {
    api: modelId.startsWith('gemini') ? 'gemini' : 'cloud-speech',
    live: modelId.includes('-live'),
  };
}

type TranscriptionModelIdFor<
  Api extends GoogleVertexTranscriptionModelRow['api'],
> = {
  [ModelId in keyof typeof transcriptionModelDefinitions]: (typeof transcriptionModelDefinitions)[ModelId]['api'] extends Api
    ? ModelId
    : never;
}[keyof typeof transcriptionModelDefinitions];

/** Known model IDs, derived from the matrices used to build the catalog. */
export type GoogleVertexModelIds = {
  language: keyof typeof languageModelDefinitions;
  image: keyof typeof imageModelDefinitions;
  embedding: keyof typeof embeddingModelDefinitions;
  video: keyof typeof videoModelDefinitions;
  speech: keyof typeof speechModelDefinitions;
  transcription: TranscriptionModelIdFor<'cloud-speech'>;
  geminiTranscription: TranscriptionModelIdFor<'gemini'>;
  anthropic: keyof typeof anthropicModelDefinitions;
  xai: keyof typeof xaiModelDefinitions;
  maas: keyof typeof maasModelDefinitions;
};
