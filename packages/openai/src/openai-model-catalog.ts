import {
  defineModelCatalog,
  type EmbeddingModelCapabilities,
  type ImageModelCapabilities,
  type LanguageModelCapabilities,
  type RealtimeModelCapabilities,
  type SpeechModelCapabilities,
  type SpeechTranslationModelCapabilities,
  type TranscriptionModelCapabilities,
} from '@ai-sdk/provider-utils';

export type OpenAIReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

/**
 * Capabilities of an OpenAI language model, used by the Chat Completions and
 * Responses models.
 *
 * @see https://platform.openai.com/docs/models
 */
export type OpenAILanguageModelCapabilities = LanguageModelCapabilities & {
  /**
   * Role that system messages are sent with.
   */
  readonly systemMessageRole: 'system' | 'developer';

  /**
   * Reasoning support, or `undefined` for models that do not reason.
   *
   * Reasoning models reject sampling parameters such as `temperature`, and
   * the Chat Completions API expects `max_completion_tokens` for them.
   *
   * @see https://platform.openai.com/docs/guides/reasoning#limitations
   */
  readonly reasoning:
    | {
        /**
         * Efforts that top-level `reasoning` maps to, or `undefined` when they
         * are not declared and the value is sent as is.
         */
        readonly efforts?: readonly OpenAIReasoningEffort[];

        /**
         * Accepts `temperature`, `topP`, and logprobs when the reasoning
         * effort is `none`.
         *
         * @see https://platform.openai.com/docs/guides/latest-model#gpt-5-1-parameter-compatibility
         */
        readonly samplingWithEffortNone: boolean;

        /**
         * Accepts logprobs on the Responses API while reasoning.
         */
        readonly logprobs: boolean;
      }
    | undefined;

  /**
   * Accepts the reasoning options of the Responses API (`reasoningEffort`,
   * `reasoningSummary`, `reasoningMode`, and `reasoningContext`). Every
   * reasoning model accepts them.
   */
  readonly reasoningOptions: boolean;

  /**
   * Service tiers that the model supports in addition to the default tier.
   */
  readonly serviceTiers: {
    readonly flex: boolean;
    /** Also used for the `fast` service tier. */
    readonly priority: boolean;
  };

  /**
   * Accepts reasoning effort updates in the middle of a conversation.
   *
   * @see https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation
   */
  readonly configurationUpdates: boolean;

  /**
   * Supports async tool calling.
   */
  readonly asyncToolCalling: boolean;

  readonly promptCache: {
    /** Accepts `prompt_cache_retention`. */
    readonly retention: boolean;
    /** Accepts `prompt_cache_options`. */
    readonly options: boolean;
  };

  /**
   * Behavior that only applies to the Chat Completions API.
   */
  readonly chat: {
    /** Accepts `temperature` when not reasoning. */
    readonly temperature: boolean;
    /** Accepts function tools while reasoning. */
    readonly functionToolsWithReasoning: boolean;
  };
};

const gpt4: OpenAILanguageModelCapabilities = {
  inputs: { image: true, audio: false },
  objectGeneration: true,
  tools: { usage: true, streaming: true },
  systemMessageRole: 'system',
  reasoning: undefined,
  reasoningOptions: false,
  serviceTiers: { flex: false, priority: true },
  configurationUpdates: false,
  asyncToolCalling: false,
  promptCache: { retention: true, options: false },
  chat: { temperature: true, functionToolsWithReasoning: true },
};

const gpt35: OpenAILanguageModelCapabilities = {
  ...gpt4,
  inputs: { image: false, audio: false },
  serviceTiers: { flex: false, priority: false },
};

const o1: OpenAILanguageModelCapabilities = {
  ...gpt4,
  systemMessageRole: 'developer',
  reasoning: { samplingWithEffortNone: false, logprobs: true },
  reasoningOptions: true,
  serviceTiers: { flex: false, priority: false },
};

const o3: OpenAILanguageModelCapabilities = {
  ...o1,
  serviceTiers: { flex: true, priority: true },
};

const gpt5: OpenAILanguageModelCapabilities = {
  ...o3,
  reasoning: {
    efforts: ['minimal', 'low', 'medium', 'high'],
    samplingWithEffortNone: false,
    logprobs: true,
  },
};

const gpt5Chat: OpenAILanguageModelCapabilities = {
  ...gpt4,
  objectGeneration: false,
  tools: { usage: false, streaming: false },
  serviceTiers: { flex: false, priority: false },
};

const gpt51: OpenAILanguageModelCapabilities = {
  ...gpt5,
  reasoning: {
    efforts: ['none', 'low', 'medium', 'high'],
    samplingWithEffortNone: true,
    logprobs: true,
  },
};

const gpt52: OpenAILanguageModelCapabilities = {
  ...gpt51,
  reasoning: {
    efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    samplingWithEffortNone: true,
    logprobs: true,
  },
};

const gpt56: OpenAILanguageModelCapabilities = {
  ...gpt52,
  reasoning: {
    efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    samplingWithEffortNone: true,
    logprobs: true,
  },
  promptCache: { retention: true, options: true },
  chat: { temperature: true, functionToolsWithReasoning: false },
};

const gpt6: OpenAILanguageModelCapabilities = {
  ...o3,
  reasoning: {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    samplingWithEffortNone: false,
    logprobs: false,
  },
  configurationUpdates: true,
  asyncToolCalling: true,
  promptCache: { retention: false, options: true },
};

// GPT-6 models that also accept reasoning effort `none`:
const gpt6WithEffortNone: OpenAILanguageModelCapabilities = {
  ...gpt6,
  reasoning: {
    efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    samplingWithEffortNone: true,
    logprobs: false,
  },
};

const gpt6Chat: OpenAILanguageModelCapabilities = {
  ...gpt6,
  systemMessageRole: 'system',
  reasoning: undefined,
  reasoningOptions: false,
  serviceTiers: { flex: false, priority: false },
};

// Unknown models: requests are sent as specified and the API validates them.
const unknownLanguageModel: OpenAILanguageModelCapabilities = {
  inputs: { image: true, audio: true },
  objectGeneration: true,
  tools: { usage: true, streaming: true },
  systemMessageRole: 'system',
  reasoning: undefined,
  reasoningOptions: true,
  serviceTiers: { flex: true, priority: true },
  configurationUpdates: true,
  asyncToolCalling: true,
  promptCache: { retention: true, options: true },
  chat: { temperature: true, functionToolsWithReasoning: true },
};

function withoutPriority(
  capabilities: OpenAILanguageModelCapabilities,
): OpenAILanguageModelCapabilities {
  return {
    ...capabilities,
    serviceTiers: { ...capabilities.serviceTiers, priority: false },
  };
}

// The supported efforts of pro, codex, and chat variants are not declared.
function withUndeclaredEfforts(
  capabilities: OpenAILanguageModelCapabilities,
): OpenAILanguageModelCapabilities {
  return capabilities.reasoning == null
    ? capabilities
    : {
        ...capabilities,
        reasoning: { ...capabilities.reasoning, efforts: undefined },
      };
}

/**
 * Entries for a GPT-5 version family. `version` is a regular expression
 * source, e.g. `5\.[2-5]`.
 */
function gpt5Family(
  version: string,
  capabilities: OpenAILanguageModelCapabilities,
) {
  return [
    {
      match: new RegExp(`^gpt-${version}(?:-(?:mini|sol|luna|terra))?$`),
      capabilities,
    },
    {
      match: new RegExp(`^gpt-${version}-nano$`),
      capabilities: withoutPriority(capabilities),
    },
    {
      match: new RegExp(`^gpt-${version}-`),
      capabilities: withUndeclaredEfforts(capabilities),
    },
  ];
}

// Major version 6 or later, e.g. `gpt-6`, `gpt-7.2`, or `gpt-10`:
const gpt6OrLater = String.raw`gpt-(?:[6-9]|[1-9]\d+)`;

export const openaiLanguageModelCatalog =
  defineModelCatalog<OpenAILanguageModelCapabilities>({
    // Fine-tuned models, e.g. `ft:gpt-4o-mini-2024-07-18:org::id`, and
    // snapshot dates, e.g. `gpt-5-2025-08-07`:
    normalize: modelId =>
      modelId
        .replace(/^ft:([^:]+):.*$/, '$1')
        .replace(/-\d{4}-\d{2}-\d{2}$/, ''),
    entries: [
      // Documented models:
      { match: ['gpt-6-astra', 'gpt-6.1-sol'], capabilities: gpt6 },
      {
        match: ['gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-sol'],
        capabilities: gpt6WithEffortNone,
      },
      {
        match: ['gpt-5.6', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra'],
        capabilities: gpt56,
      },
      { match: 'gpt-5.5', capabilities: gpt52 },
      { match: 'gpt-5.4-pro', capabilities: withUndeclaredEfforts(gpt52) },
      { match: ['gpt-5.4', 'gpt-5.4-mini'], capabilities: gpt52 },
      { match: 'gpt-5.4-nano', capabilities: withoutPriority(gpt52) },
      {
        match: ['gpt-5.3-chat-latest', 'gpt-5.2-pro', 'gpt-5.2-chat-latest'],
        capabilities: withUndeclaredEfforts(gpt52),
      },
      { match: 'gpt-5.2', capabilities: gpt52 },
      {
        match: ['gpt-5.1-codex-mini', 'gpt-5.1-codex', 'gpt-5.1-chat-latest'],
        capabilities: withUndeclaredEfforts(gpt51),
      },
      { match: 'gpt-5.1', capabilities: gpt51 },
      { match: 'gpt-5-pro', capabilities: withUndeclaredEfforts(gpt5) },
      { match: ['gpt-5', 'gpt-5-mini'], capabilities: gpt5 },
      { match: 'gpt-5-nano', capabilities: withoutPriority(gpt5) },
      { match: 'gpt-5-codex', capabilities: withUndeclaredEfforts(gpt5) },
      { match: 'gpt-5-chat-latest', capabilities: gpt5Chat },
      {
        match: [
          'gpt-4.1',
          'gpt-4.1-mini',
          'gpt-4.1-nano',
          'gpt-4o',
          'gpt-4o-mini',
        ],
        capabilities: gpt4,
      },

      // Model families, tested in order:
      { match: new RegExp(`^${gpt6OrLater}-chat`), capabilities: gpt6Chat },
      {
        match: new RegExp(`^${gpt6OrLater}(?:\\.\\d+)?-nano`),
        capabilities: withoutPriority(gpt6),
      },
      {
        match: new RegExp(`^${gpt6OrLater}(?:\\.\\d+)?(?:-|$)`),
        capabilities: gpt6,
      },
      { match: /^gpt-5-chat/, capabilities: gpt5Chat },
      ...gpt5Family(String.raw`5\.(?:[6-9]|[1-9]\d+)`, gpt56),
      ...gpt5Family(String.raw`5\.[2-5]`, gpt52),
      ...gpt5Family(String.raw`5\.1`, gpt51),
      ...gpt5Family(String.raw`5(?:\.0)?`, gpt5),
      {
        match: /^gpt-4o(?:-mini)?-search-preview/,
        capabilities: { ...gpt4, chat: { ...gpt4.chat, temperature: false } },
      },
      {
        match: /^gpt-4o(?:-mini)?-audio-preview/,
        capabilities: { ...gpt4, inputs: { image: false, audio: true } },
      },
      { match: /^gpt-4/, capabilities: gpt4 },
      { match: /^gpt-3/, capabilities: gpt35 },
      {
        match: /^o3-mini(?:-|$)/,
        capabilities: { ...o3, inputs: { image: false, audio: false } },
      },
      // o3 and later:
      { match: /^o(?:[3-9]|[1-9]\d+)(?:-|$)/, capabilities: o3 },
      { match: /^o\d+(?:-|$)/, capabilities: o1 },
    ],
    fallback: () => unknownLanguageModel,
  });

/**
 * Returns the reasoning capabilities of a model, with the `forceReasoning`
 * provider option applied. Models that are forced to reason get the
 * restrictions of the first reasoning models.
 */
export function getOpenAIReasoningCapabilities(
  capabilities: OpenAILanguageModelCapabilities,
  forceReasoning: boolean | undefined,
): OpenAILanguageModelCapabilities['reasoning'] {
  if (forceReasoning === false) {
    return undefined;
  }

  return (
    capabilities.reasoning ??
    (forceReasoning === true ? o1.reasoning : undefined)
  );
}

/**
 * Capabilities of an OpenAI image model.
 */
export type OpenAIImageModelCapabilities = ImageModelCapabilities & {
  /**
   * Value sent as `response_format`, or `undefined` when the model returns
   * base64 images by default and rejects the parameter.
   */
  readonly responseFormat: 'b64_json' | undefined;
};

const gptImageSizes = ['1024x1024', '1536x1024', '1024x1536'];

function gptImage(
  sizes: OpenAIImageModelCapabilities['sizes'],
): OpenAIImageModelCapabilities {
  return {
    sizes,
    fileInput: true,
    maskInput: true,
    maxImagesPerCall: 10,
    responseFormat: undefined,
  };
}

export const openaiImageModelCatalog =
  defineModelCatalog<OpenAIImageModelCapabilities>({
    // Snapshot dates, e.g. `gpt-image-2.5-flare-2026-09-08`:
    normalize: modelId => modelId.replace(/-\d{4}-\d{2}-\d{2}$/, ''),
    entries: [
      {
        match: ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'],
        capabilities: gptImage('custom'),
      },
      {
        match: [
          'gpt-image-2',
          'gpt-image-1.5',
          'gpt-image-1-mini',
          'gpt-image-1',
        ],
        capabilities: gptImage(gptImageSizes),
      },
      {
        match: 'dall-e-3',
        capabilities: {
          sizes: ['1024x1024', '1792x1024', '1024x1792'],
          fileInput: false,
          maskInput: false,
          maxImagesPerCall: 1,
          responseFormat: 'b64_json',
        },
      },
      {
        match: 'dall-e-2',
        capabilities: {
          sizes: ['256x256', '512x512', '1024x1024'],
          fileInput: true,
          maskInput: true,
          maxImagesPerCall: 10,
          responseFormat: 'b64_json',
        },
      },
      { match: 'chatgpt-image-latest', capabilities: gptImage(undefined) },

      // Model families:
      {
        match: /^gpt-image-/,
        capabilities: {
          sizes: undefined,
          fileInput: undefined,
          maskInput: undefined,
          maxImagesPerCall: 10,
          responseFormat: undefined,
        },
      },
      {
        match: /^chatgpt-image-/,
        capabilities: {
          sizes: undefined,
          fileInput: undefined,
          maskInput: undefined,
          maxImagesPerCall: 1,
          responseFormat: undefined,
        },
      },
    ],
    fallback: () => ({
      sizes: undefined,
      fileInput: undefined,
      maskInput: undefined,
      maxImagesPerCall: 1,
      responseFormat: 'b64_json',
    }),
  });

/**
 * Capabilities of an OpenAI transcription model.
 */
export type OpenAITranscriptionModelCapabilities =
  TranscriptionModelCapabilities & {
    /** Default `response_format`. */
    readonly responseFormat: 'verbose_json' | 'diarized_json' | undefined;
    /** Default `chunking_strategy`. */
    readonly chunkingStrategy: 'auto' | undefined;
    /** Field that the language is sent in when streaming. */
    readonly languageField: 'language' | 'languages';
  };

const gpt4oTranscribe: OpenAITranscriptionModelCapabilities = {
  transcription: true,
  streaming: false,
  streamingDelay: false,
  duration: false,
  segments: false,
  language: false,
  responseFormat: undefined,
  chunkingStrategy: undefined,
  languageField: 'language',
};

const gptTranscribe: OpenAITranscriptionModelCapabilities = {
  transcription: true,
  streaming: true,
  streamingDelay: false,
  duration: false,
  segments: false,
  language: true,
  responseFormat: undefined,
  chunkingStrategy: undefined,
  languageField: 'languages',
};

const gptLiveTranscribe: OpenAITranscriptionModelCapabilities = {
  transcription: false,
  streaming: true,
  streamingDelay: true,
  duration: false,
  segments: false,
  language: false,
  responseFormat: undefined,
  chunkingStrategy: undefined,
  languageField: 'languages',
};

const gptRealtimeWhisper: OpenAITranscriptionModelCapabilities = {
  ...gptLiveTranscribe,
  languageField: 'language',
};

export const openaiTranscriptionModelCatalog =
  defineModelCatalog<OpenAITranscriptionModelCapabilities>({
    // Snapshot dates, e.g. `gpt-4o-mini-transcribe-2025-03-20`:
    normalize: modelId => modelId.replace(/-\d{4}-\d{2}-\d{2}$/, ''),
    entries: [
      {
        match: 'whisper-1',
        capabilities: {
          ...gpt4oTranscribe,
          duration: true,
          segments: true,
          language: true,
          responseFormat: 'verbose_json',
        },
      },
      {
        match: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe'],
        capabilities: gpt4oTranscribe,
      },
      {
        match: 'gpt-4o-transcribe-diarize',
        capabilities: {
          ...gpt4oTranscribe,
          duration: true,
          segments: true,
          responseFormat: 'diarized_json',
          chunkingStrategy: 'auto',
        },
      },
      { match: 'gpt-transcribe', capabilities: gptTranscribe },
      { match: 'gpt-live-transcribe', capabilities: gptLiveTranscribe },
      { match: 'gpt-realtime-whisper', capabilities: gptRealtimeWhisper },

      // Model families:
      { match: /^gpt-transcribe-/, capabilities: gptTranscribe },
      { match: /^gpt-live-transcribe-/, capabilities: gptLiveTranscribe },
      { match: /^gpt-realtime-whisper-/, capabilities: gptRealtimeWhisper },
    ],
    fallback: () => ({
      transcription: true,
      streaming: true,
      streamingDelay: true,
      duration: true,
      segments: true,
      language: true,
      responseFormat: undefined,
      chunkingStrategy: undefined,
      languageField: 'language',
    }),
  });

export const openaiEmbeddingModelCatalog =
  defineModelCatalog<EmbeddingModelCapabilities>({
    entries: [
      {
        match: 'text-embedding-3-large',
        capabilities: { defaultDimensions: 3072, customDimensions: true },
      },
      {
        match: 'text-embedding-3-small',
        capabilities: { defaultDimensions: 1536, customDimensions: true },
      },
      {
        match: 'text-embedding-ada-002',
        capabilities: { defaultDimensions: 1536, customDimensions: false },
      },
    ],
    fallback: () => ({ defaultDimensions: 1536, customDimensions: true }),
  });

export const openaiSpeechModelCatalog =
  defineModelCatalog<SpeechModelCapabilities>({
    // Snapshot suffixes, e.g. `tts-1-1106` or `gpt-4o-mini-tts-2025-03-20`:
    normalize: modelId => modelId.replace(/-(?:\d{4}-\d{2}-\d{2}|\d{4})$/, ''),
    entries: [
      { match: ['tts-1', 'tts-1-hd'], capabilities: { instructions: false } },
      { match: 'gpt-4o-mini-tts', capabilities: { instructions: true } },
    ],
    fallback: () => ({ instructions: true }),
  });

export const openaiSpeechTranslationModelCatalog =
  defineModelCatalog<SpeechTranslationModelCapabilities>({
    entries: [
      {
        match: 'gpt-realtime-translate',
        capabilities: {
          translatedAudio: true,
          translatedText: true,
          sourceTranscript: true,
        },
      },
    ],
    fallback: () => ({
      translatedAudio: true,
      translatedText: true,
      sourceTranscript: true,
    }),
  });

/**
 * Capabilities of an OpenAI realtime model.
 */
export type OpenAIRealtimeModelCapabilities = RealtimeModelCapabilities & {
  /** Realtime API that the model uses. */
  readonly api: 'live' | 'realtime';
  readonly startup: 'session-start' | 'session-update';
  readonly finalization: 'session-close' | 'transport-close';
};

const liveRealtimeModel = {
  conversation: 'continuous',
  transports: ['websocket', 'webrtc'],
  connections: ['server-websocket', 'webrtc'],
  api: 'live',
  startup: 'session-start',
  finalization: 'session-close',
} as const satisfies OpenAIRealtimeModelCapabilities;

const turnBasedRealtimeModel = {
  conversation: 'turn-based',
  transports: ['websocket'],
  connections: ['client-secret-websocket'],
  api: 'realtime',
  startup: 'session-update',
  finalization: 'transport-close',
} as const satisfies OpenAIRealtimeModelCapabilities;

export const openaiRealtimeModelCatalog =
  defineModelCatalog<OpenAIRealtimeModelCapabilities>({
    entries: [
      { match: 'gpt-live-1', capabilities: liveRealtimeModel },
      { match: 'gpt-realtime', capabilities: turnBasedRealtimeModel },
    ],
    fallback: () => turnBasedRealtimeModel,
  });

/** Model IDs that the realtime factory routes to the live API. */
export type OpenAIKnownLiveModelId = 'gpt-live-1';

/** Capabilities of models that use the live API. */
export const openaiLiveRealtimeCapabilities = {
  conversation: liveRealtimeModel.conversation,
  transports: liveRealtimeModel.transports,
  connections: liveRealtimeModel.connections,
  startup: liveRealtimeModel.startup,
  finalization: liveRealtimeModel.finalization,
} as const;
