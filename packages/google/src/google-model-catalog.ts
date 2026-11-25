import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { GoogleLanguageModelOptions } from './google-language-model-options';

const gemini1ModelPattern = /(^|[/.])gemini-1(?:[.-]|$)/i;
const gemini2ModelPattern = /(^|[/.])gemini-2(?:[.-]|$)/i;
const gemini25ModelPattern = /(^|[/.])gemini-2\.5(?:[.-]|$)/i;
const geminiModelPattern = /(^|[/.])gemini-/i;

type GoogleLanguageProviderOption = keyof GoogleLanguageModelOptions;

/** Options accepted under providerOptions.google (or googleVertex on Vertex). */
export const googleProviderOptions = {
  language: {
    responseModalities: { description: 'Response modalities to generate.' },
    thinkingConfig: {
      description: 'Thinking budget, level, and thought output.',
    },
    cachedContent: { description: 'Cached content to use as request context.' },
    structuredOutputs: {
      description: 'Whether to send the JSON response schema.',
    },
    safetySettings: { description: 'Safety settings for the request.' },
    threshold: {
      description: 'Default threshold for configurable safety categories.',
    },
    audioTimestamp: {
      description: 'Enable timestamp understanding for audio.',
    },
    labels: { description: 'Billing labels. Vertex AI only.' },
    mediaResolution: {
      description: 'Resolution used to process media inputs.',
    },
    imageConfig: { description: 'Image generation configuration.' },
    retrievalConfig: { description: 'Retrieval configuration for tools.' },
    streamFunctionCallArguments: {
      description: 'Stream function arguments. Vertex AI only.',
    },
    serviceTier: { description: 'Service tier. Gemini API only.' },
    continuationToken: {
      description: 'Resume a response using its continuation token.',
    },
    sharedRequestType: { description: 'Shared PayGo tier. Vertex AI only.' },
    requestType: { description: 'Request routing type. Vertex AI only.' },
  } satisfies Record<GoogleLanguageProviderOption, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

type GoogleLanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  inputs: NonNullable<ModelCapabilities['language']>['inputs'] & {
    /** Accepts public HTTPS URLs for file inputs. */
    externalFileUrls: boolean;
  };
  tools: NonNullable<ModelCapabilities['language']>['tools'] & {
    /** Accepts provider-defined tools. */
    providerTools: boolean;
    googleSearch: ModelCapability;
    urlContext: ModelCapability;
    fileSearch: boolean;
    /** Accepts function tools and provider-defined tools in one request. */
    mixed: boolean;
    /** Accepts images and files in function responses. */
    functionResponseParts: boolean;
    /** Requires a thought signature on replayed function calls. */
    thoughtSignatures: boolean;
  };
  reasoning: NonNullable<ModelCapabilities['language']>['reasoning'] & {
    minBudget: number;
    maxBudget: number;
  };
  sampling: NonNullable<ModelCapabilities['language']>['sampling'] & {
    topK: ModelCapability;
    penalties: ModelCapability;
  };
  structuredOutput: {
    withFunctionTools: boolean;
  };
};

type GoogleLanguageRequestConfig = {
  systemInstruction: 'system' | 'user';
  thinkingFormat: 'level' | 'budget';
  reasoningMaxOutputTokens: number;
  jsonResponseTool: boolean;
};

export type GoogleLanguageModelEntry = ModelEntry<{
  language: GoogleLanguageRequestConfig;
}> & {
  capabilities: { language: GoogleLanguageCapabilities };
  providerOptions: {
    language: Record<GoogleLanguageProviderOption, ModelCapability>;
  };
  requestConfig: { language: GoogleLanguageRequestConfig };
};

/** What a model accepts together with function tools. */
type GoogleFunctionToolFeature =
  /** Streams function tool calls. */
  | 'streaming'
  /** Function tools and provider-defined tools in the same request. */
  | 'with-provider-tools'
  /** Images and files in function responses. */
  | 'multimodal-responses'
  /** Replayed function calls must carry a thought signature. */
  | 'thought-signatures'
  /** A JSON response schema in the same request. */
  | 'with-response-schema'
  /**
   * The JSON response schema is sent as a function tool when it cannot be
   * combined with the request's function tools.
   */
  | 'json-response-tool';

/**
 * One row of the language model matrix. Every capability that differs between
 * models is one flat cell, and every listed language model fills in every
 * cell. Nothing is derived from the model ID.
 *
 * Facts that depend on each other share one cell, so a row cannot contradict
 * itself: a cell is a single value, one of a fixed set of values, or the list
 * of what the model supports.
 */
export type GoogleLanguageModelRow = {
  /**
   * `false` keeps a known model ID out of the exported catalog and the
   * generated documentation. Its function tool support and provider options
   * are then reported as `'unknown'`.
   */
  documented: boolean;
  image: ModelCapability;
  /** Accepts public HTTPS URLs for file inputs. */
  externalFileUrls: boolean;
  objectGeneration: ModelCapability;
  googleSearch: ModelCapability;
  urlContext: ModelCapability;
  /**
   * `false`: no function tools. Otherwise the model supports function tools,
   * and the list holds what it accepts together with them.
   */
  functionTools: false | readonly GoogleFunctionToolFeature[];
  /**
   * Provider-defined tools, such as Google Search, URL context, and code
   * execution. `false`: none.
   */
  providerTools: false | 'without-file-search' | 'with-file-search';
  /**
   * Thinking levels the model accepts. `undefined`: thinking is configured
   * with a thinking budget instead.
   */
  thinkingLevels: readonly string[] | undefined;
  minThinkingBudget: number;
  maxThinkingBudget: number;
  /** Presence and frequency penalties. */
  penalties: ModelCapability;
  /** Where the system prompt is sent. */
  systemInstruction: GoogleLanguageRequestConfig['systemInstruction'];
};

// Conditional support, used as a cell value in the matrix below.
const vertexOnly = {
  condition: 'Only supported on the Vertex AI API.',
} as const;

/**
 * Model IDs by suggested model type. Language model IDs also declare their
 * language model row; to add one, add a row and fill in every column.
 */
const modelDefinitions = {
  'gemini-nano-banana-2.1': {
    types: ['language', 'interactions', 'image'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: false,
      googleSearch: true,
      urlContext: false,
      functionTools: false,
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-4-argon': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-4-carbon': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-4-hydrogen': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['low', 'medium', 'high', 'xhigh'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-4-neon': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['low', 'medium', 'high', 'xhigh'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.8-flash': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.7-flash': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.6-flash': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.5-flash': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.5-flash-lite': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.1-pro-preview': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.1-flash-image-preview': {
    types: ['language', 'interactions', 'image'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.1-flash-lite-preview': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3-pro-preview': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3-pro-image-preview': {
    types: ['language', 'interactions', 'image'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 32768,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3-flash-preview': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-pro': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 128,
      maxThinkingBudget: 32768,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash-lite': {
    types: ['language', 'interactions'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash-lite-preview-06-17': {
    types: ['language'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: true,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.0-flash': {
    types: ['language'],
    language: {
      documented: true,
      image: true,
      externalFileUrls: false,
      objectGeneration: true,
      googleSearch: true,
      urlContext: true,
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'without-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  aqa: {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'deep-research-max-preview-04-2026': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'deep-research-preview-04-2026': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'deep-research-pro-preview-12-2025': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-2.0-flash-001': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'without-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-2.0-flash-lite': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'without-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-2.0-flash-lite-001': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'without-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-computer-use-preview-10-2025': {
    types: ['language', 'interactions'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash-image': {
    types: ['language', 'interactions', 'image'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash-native-audio-latest': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash-native-audio-preview-09-2025': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash-native-audio-preview-12-2025': {
    types: ['language', 'interactions'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash-preview-tts': {
    types: ['language', 'interactions', 'speech'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-pro-preview-tts': {
    types: ['language', 'interactions', 'speech'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: 'with-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 128,
      maxThinkingBudget: 32768,
      penalties: vertexOnly,
      systemInstruction: 'system',
    },
  },
  'gemini-3.1-flash-tts-preview': {
    types: ['language', 'interactions', 'speech'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-3.1-pro-preview-customtools': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-flash-latest': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-flash-lite-latest': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-pro-latest': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: [
        'streaming',
        'with-provider-tools',
        'multimodal-responses',
        'thought-signatures',
        'with-response-schema',
        'json-response-tool',
      ],
      providerTools: 'with-file-search',
      thinkingLevels: ['minimal', 'low', 'medium', 'high'],
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-robotics-er-1.5-preview': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: true,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming', 'json-response-tool'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemma-3-12b-it': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'user',
    },
  },
  'gemma-3-1b-it': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'user',
    },
  },
  'gemma-3-27b-it': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'user',
    },
  },
  'gemma-3-4b-it': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'user',
    },
  },
  'gemma-3n-e2b-it': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'user',
    },
  },
  'gemma-3n-e4b-it': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: false,
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'user',
    },
  },
  'nano-banana-pro-preview': {
    types: ['language'],
    language: {
      documented: false,
      image: 'unknown',
      externalFileUrls: false,
      objectGeneration: 'unknown',
      googleSearch: 'unknown',
      urlContext: 'unknown',
      functionTools: ['streaming'],
      providerTools: 'without-file-search',
      thinkingLevels: undefined,
      minThinkingBudget: 0,
      maxThinkingBudget: 24576,
      penalties: true,
      systemInstruction: 'system',
    },
  },
  'gemini-2.5-flash-lite-preview-09-2025': {
    types: ['interactions'],
  },
  'gemini-2.5-flash-preview-09-2025': {
    types: ['interactions'],
  },
  'lyria-3-clip-preview': {
    types: ['interactions'],
  },
  'lyria-3-pro-preview': {
    types: ['interactions'],
  },
  'gemini-3.8-flash-tts': {
    types: ['speech'],
  },
  'gemini-3.8-flash-lite-tts': {
    types: ['speech'],
  },
  'gemini-embedding-001': {
    types: ['embedding'],
  },
  'gemini-embedding-2': {
    types: ['embedding'],
  },
  'gemini-embedding-2-preview': {
    types: ['embedding'],
  },
  'veo-3.1-fast-generate-preview': {
    types: ['video'],
  },
  'veo-3.1-generate-preview': {
    types: ['video'],
  },
  'veo-3.1-generate': {
    types: ['video'],
  },
  'veo-3.1-lite-generate-preview': {
    types: ['video'],
  },
  'veo-3.0-generate-001': {
    types: ['video'],
  },
  'veo-3.0-fast-generate-001': {
    types: ['video'],
  },
  'veo-2.0-generate-001': {
    types: ['video'],
  },
  'gemini-3.5-transcribe': {
    types: ['transcription'],
  },
  'gemini-3.5-transcribe-live': {
    types: ['transcription'],
  },
  'gemini-3.5-live-translate-preview': {
    types: ['speechTranslation'],
  },
  'gemini-decision-1': {
    types: ['decision'],
  },
} as const satisfies Record<string, GoogleModelDefinition>;

type GoogleModelDefinition = {
  types: readonly string[];
  /** Declared by every listed model ID whose `types` include `'language'`. */
  language?: GoogleLanguageModelRow;
};

const googleLanguageModelRows = Object.entries<GoogleModelDefinition>(
  modelDefinitions,
).flatMap(([modelId, { language }]) =>
  language == null ? [] : [[modelId, language] as const],
);

/** Entries for every listed language model ID, documented or not. */
const googleListedLanguageModelEntries: Readonly<
  Record<string, GoogleLanguageModelEntry>
> = Object.fromEntries(
  googleLanguageModelRows.map(([modelId, row]) => [
    modelId,
    createGoogleLanguageModelEntry(row),
  ]),
);

export const googleModelCatalog: Readonly<
  Record<string, GoogleLanguageModelEntry>
> = Object.fromEntries(
  googleLanguageModelRows
    .filter(([, row]) => row.documented)
    .map(([modelId]) => [modelId, googleListedLanguageModelEntries[modelId]]),
);

/**
 * Returns the entry of a listed language model ID from its row. Every other
 * model ID uses the fallback for unlisted IDs.
 */
export function getGoogleLanguageModelEntry(
  modelId: string,
): GoogleLanguageModelEntry {
  return Object.prototype.hasOwnProperty.call(
    googleListedLanguageModelEntries,
    modelId,
  )
    ? googleListedLanguageModelEntries[modelId]
    : createGoogleLanguageModelEntry(resolveUnlistedLanguageModelRow(modelId));
}

/** Maps a matrix row to its entry. Nothing here inspects the model ID. */
function createGoogleLanguageModelEntry(
  row: GoogleLanguageModelRow,
): GoogleLanguageModelEntry {
  const functionTools = row.functionTools === false ? [] : row.functionTools;
  const language: GoogleLanguageCapabilities = {
    inputs: {
      image: row.image,
      audio: 'unknown',
      externalFileUrls: row.externalFileUrls,
    },
    objectGeneration: row.objectGeneration,
    tools: {
      usage: row.documented ? row.functionTools !== false : 'unknown',
      streaming: row.documented
        ? functionTools.includes('streaming')
        : 'unknown',
      providerTools: row.providerTools !== false,
      googleSearch: row.googleSearch,
      urlContext: row.urlContext,
      fileSearch: row.providerTools === 'with-file-search',
      mixed: functionTools.includes('with-provider-tools'),
      functionResponseParts: functionTools.includes('multimodal-responses'),
      thoughtSignatures: functionTools.includes('thought-signatures'),
    },
    reasoning: {
      support: 'unknown',
      efforts: row.thinkingLevels,
      minBudget: row.minThinkingBudget,
      maxBudget: row.maxThinkingBudget,
    },
    sampling: {
      temperature: 'unknown',
      topP: 'unknown',
      topK: 'unknown',
      logprobs: false,
      penalties: row.penalties,
    },
    structuredOutput: {
      withFunctionTools: functionTools.includes('with-response-schema'),
    },
  };

  return {
    capabilities: { language },
    providerOptions: {
      language: declareProviderOptions(row.documented ? true : 'unknown', {
        labels: vertexOnly,
        sharedRequestType: vertexOnly,
        requestType: vertexOnly,
        serviceTier: { condition: 'Only supported on the Gemini API.' },
        streamFunctionCallArguments: {
          condition:
            'Only supported for streaming requests on the Vertex AI API with Gemini 3 or newer.',
        },
      }),
    },
    requestConfig: {
      language: {
        systemInstruction: row.systemInstruction,
        thinkingFormat: row.thinkingLevels == null ? 'budget' : 'level',
        reasoningMaxOutputTokens: 65536,
        jsonResponseTool: functionTools.includes('json-response-tool'),
      },
    },
  };
}

/**
 * Fallback for model IDs that are not listed in the matrix above (including
 * prefixed IDs, Vertex AI paths, case variants, and listed IDs without a
 * language row). It is the only place that derives capabilities from the
 * model ID, using Gemini family and version rules so new models keep working
 * before they are listed.
 */
function resolveUnlistedLanguageModelRow(
  modelId: string,
): GoogleLanguageModelRow {
  const runtime = resolveRuntimeDefinition(modelId);
  const id = modelId.toLowerCase();
  // Preserve the original case-sensitive exception in the thinking resolver.
  const thinkingFormat =
    runtime.usesGemini3Features && !modelId.includes('gemini-3-pro-image')
      ? 'level'
      : 'budget';
  // Hydrogen and Neon add `xhigh` and have no `minimal` thinking level.
  const supportsXhighThinking =
    /(^|[/.])gemini-4-(?:hydrogen|neon)(?:-|$)/i.test(modelId);
  const minLevel = supportsXhighThinking
    ? 'low'
    : getMinimumThinkingLevelForGemini3Model(modelId);

  return {
    documented: false,
    image: 'unknown',
    externalFileUrls:
      /(^|\/)gemini-/.test(modelId) && !/(^|\/)gemini-2\.0/.test(modelId),
    objectGeneration: 'unknown',
    googleSearch: 'unknown',
    urlContext: 'unknown',
    functionTools: [
      'streaming',
      ...(runtime.usesGemini3Features
        ? ([
            'with-provider-tools',
            'multimodal-responses',
            'thought-signatures',
            'with-response-schema',
          ] as const)
        : []),
      ...(/(^|\/)gemini-/i.test(modelId)
        ? (['json-response-tool'] as const)
        : []),
    ],
    providerTools: !runtime.supportsGemini2Tools
      ? false
      : runtime.supportsFileSearch
        ? 'with-file-search'
        : 'without-file-search',
    thinkingLevels:
      thinkingFormat === 'level'
        ? [
            ...(minLevel === 'minimal' ? ['minimal'] : []),
            'low',
            'medium',
            'high',
            ...(supportsXhighThinking ? ['xhigh'] : []),
          ]
        : undefined,
    minThinkingBudget: id.includes('2.5-pro') ? 128 : 0,
    maxThinkingBudget:
      id.includes('2.5-pro') || id.includes('gemini-3-pro-image')
        ? 32768
        : 24576,
    penalties: gemini25ModelPattern.test(modelId) ? vertexOnly : true,
    systemInstruction: id.startsWith('gemma-') ? 'user' : 'system',
  };
}

function declareProviderOptions(
  support: ModelCapability,
  exceptions: Partial<Record<GoogleLanguageProviderOption, ModelCapability>>,
): Record<GoogleLanguageProviderOption, ModelCapability> {
  return Object.fromEntries(
    (
      Object.keys(
        googleProviderOptions.language,
      ) as GoogleLanguageProviderOption[]
    ).map(option => [option, exceptions[option] ?? support]),
  ) as Record<GoogleLanguageProviderOption, ModelCapability>;
}

function isKnownPreGemini2Model(modelId: string): boolean {
  return (
    gemini1ModelPattern.test(modelId) ||
    /(^|[/.])gemini-pro(?:-vision)?$/i.test(modelId) ||
    /(^|[/.])gemini-robotics-er-1\.5(?:[.-]|$)/i.test(modelId)
  );
}

/**
 * Classifies Gemini capabilities by excluding known older generations.
 *
 * Google model IDs are open-ended, so unrecognized Gemini IDs and aliases
 * intentionally inherit the newest supported behavior. Add exceptions here
 * only when a model is known to require a legacy request shape.
 */
function resolveRuntimeDefinition(modelId: string) {
  const isGeminiModel = geminiModelPattern.test(modelId);
  const isGemini2Model = gemini2ModelPattern.test(modelId);
  const isKnownPreGemini2 = isKnownPreGemini2Model(modelId);
  const isKnownOlderModel = isKnownPreGemini2 || isGemini2Model;
  const usesGemini3Features = isGeminiModel && !isKnownOlderModel;

  return {
    supportsGemini2Tools:
      (isGeminiModel && !isKnownPreGemini2) ||
      modelId.toLowerCase().includes('nano-banana'),
    supportsFileSearch:
      gemini25ModelPattern.test(modelId) || usesGemini3Features,
    usesGemini3Features,
  };
}

function getMinimumThinkingLevelForGemini3Model(
  modelId: string,
): 'minimal' | 'low' {
  const modelName = /(?:^|[/.])(gemini-[^/]*)$/i
    .exec(modelId)?.[1]
    .toLowerCase();

  if (modelName === 'gemini-flash-latest') {
    return 'low';
  }

  const proVersionMatch = /^gemini-(\d+)(?:\.\d+)?-pro(?:$|-)/.exec(
    modelName ?? '',
  );

  if (Number(proVersionMatch?.[1]) >= 3) {
    return 'low';
  }

  const versionMatch = /^gemini-(\d+)\.(\d+)-flash(?:$|-(?!lite(?:-|$)))/.exec(
    modelName ?? '',
  );

  if (versionMatch == null) {
    return 'minimal';
  }

  const majorVersion = Number(versionMatch[1]);
  const minorVersion = Number(versionMatch[2]);

  return majorVersion > 3 || (majorVersion === 3 && minorVersion >= 7)
    ? 'low'
    : 'minimal';
}

type GoogleModelType =
  (typeof modelDefinitions)[keyof typeof modelDefinitions]['types'][number];

type GoogleModelIdFor<Type extends GoogleModelType> = {
  [ModelId in keyof typeof modelDefinitions]: Type extends (typeof modelDefinitions)[ModelId]['types'][number]
    ? ModelId
    : never;
}[keyof typeof modelDefinitions];

/** Known model IDs, derived from the declarations used to build the catalog. */
export type GoogleModelIds = {
  [Type in GoogleModelType]: GoogleModelIdFor<Type>;
};
