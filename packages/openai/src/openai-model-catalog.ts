import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { OpenAILanguageModelResponsesOptions } from './responses/openai-responses-language-model-options';

type OpenAILanguageProviderOption = keyof OpenAILanguageModelResponsesOptions;

/**
 * Options accepted under `providerOptions.openai`. Language options are the
 * Responses API options. The `satisfies` check keeps this list in sync with
 * the option schema.
 */
export const openaiProviderOptions = {
  language: {
    conversation: { description: 'OpenAI Conversation ID to continue.' },
    include: { description: 'Extra fields to include in the response.' },
    includeWebSearchSources: {
      description: 'Include web search action sources.',
    },
    instructions: { description: 'Instructions for the model.' },
    logprobs: { description: 'Return token log probabilities.' },
    maxToolCalls: { description: 'Maximum number of built-in tool calls.' },
    metadata: { description: 'Metadata to store with the generation.' },
    parallelToolCalls: { description: 'Whether to use parallel tool calls.' },
    previousResponseId: { description: 'Previous response ID to continue.' },
    promptCacheKey: { description: 'Cache key for prompt caching.' },
    promptCacheOptions: { description: 'Prompt cache mode, TTL, and prewarm.' },
    promptCacheRetention: { description: 'Prompt cache retention policy.' },
    reasoningEffort: { description: 'Reasoning effort.' },
    reasoningEffortUpdate: {
      description: 'Reasoning effort update from this response onward.',
    },
    reasoningMode: { description: 'Standard or pro reasoning mode.' },
    reasoningContext: { description: 'Which reasoning items can be used.' },
    reasoningSummary: { description: 'Reasoning summary output.' },
    safetyIdentifier: { description: 'Identifier for safety monitoring.' },
    serviceTier: { description: 'Service tier for the request.' },
    store: { description: 'Whether to store the generation.' },
    passThroughUnsupportedFiles: {
      description: 'Send non-image file types as generic input files.',
    },
    strictJsonSchema: { description: 'Use strict JSON schema validation.' },
    textVerbosity: { description: 'Verbosity of text responses.' },
    truncation: { description: 'Output truncation behavior.' },
    user: { description: 'End-user identifier for abuse monitoring.' },
    systemMessageMode: { description: 'System message role override.' },
    forceReasoning: { description: 'Treat the model as a reasoning model.' },
    contextManagement: { description: 'Server-side context compaction.' },
    compactionTrigger: { description: 'Request explicit compaction.' },
    allowedTools: { description: 'Restrict callable tools to a subset.' },
  } satisfies Record<OpenAILanguageProviderOption, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

export type OpenAILanguageModelEntry = {
  capabilities: {
    language: NonNullable<ModelCapabilities['language']> & {
      serviceTiers: {
        flex: boolean;
        priority: boolean;
      };
      configurationUpdates: boolean;
      tools: NonNullable<ModelCapabilities['language']>['tools'] & {
        async: boolean;
      };
      reasoning: NonNullable<ModelCapabilities['language']>['reasoning'] & {
        sampling: 'unsupported' | 'reasoning-effort-none';
      };
      promptCache: {
        retention: boolean;
        options: ModelCapability;
      };
      endpoints: {
        chat: {
          temperatureWithoutReasoning: boolean;
          functionToolsWithReasoning: boolean;
        };
        responses: {
          logprobsRequireNonReasoning: boolean;
        };
      };
    };
  };
  providerOptions: {
    language: Record<OpenAILanguageProviderOption, ModelCapability>;
  };
  requestConfig: {
    language: {
      systemMessageMode: 'remove' | 'system' | 'developer';
    };
  };
};

type OpenAILanguageModelDefinition = {
  capabilities?: {
    language?: Partial<
      Pick<
        OpenAILanguageModelEntry['capabilities']['language'],
        'inputs' | 'objectGeneration' | 'tools' | 'reasoning'
      >
    >;
  };
  requestConfig?: {
    language?: Partial<OpenAILanguageModelEntry['requestConfig']['language']>;
  };
};

const configurableNonReasoning: OpenAILanguageModelDefinition = {
  capabilities: {
    language: {
      reasoning: {
        support: true,
        efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        sampling: 'reasoning-effort-none',
      },
    },
  },
};

// Model-specific exceptions belong in the table; family rules provide defaults.
const openaiLanguageModelDefinitions: Record<
  string,
  OpenAILanguageModelDefinition
> = {
  'gpt-6-astra': {},
  'gpt-6.1-sol': {},
  'gpt-6.1-terra': configurableNonReasoning,
  'gpt-6-luna': configurableNonReasoning,
  'gpt-6-sol': configurableNonReasoning,
  'gpt-5.6': {},
  'gpt-5.6-luna': {},
  'gpt-5.6-sol': {},
  'gpt-5.6-terra': {},
  'gpt-5.5': {},
  'gpt-5.4-pro': {},
  'gpt-5.4': {},
  'gpt-5.4-mini': {},
  'gpt-5.4-nano': {},
  'gpt-5.3-chat-latest': {},
  'gpt-5.2-pro': {},
  'gpt-5.2-chat-latest': {},
  'gpt-5.2': {},
  'gpt-5.1-codex-mini': {},
  'gpt-5.1-codex': {},
  'gpt-5.1-chat-latest': {},
  'gpt-5.1': {},
  'gpt-5-pro': {},
  'gpt-5': {},
  'gpt-5-mini': {},
  'gpt-5-nano': {},
  'gpt-5-codex': {},
  'gpt-5-chat-latest': {
    capabilities: {
      language: {
        objectGeneration: false,
        tools: { usage: false, streaming: false, async: false },
      },
    },
  },
  'gpt-4.1': {},
  'gpt-4.1-mini': {},
  'gpt-4.1-nano': {},
  'gpt-4o': {},
  'gpt-4o-mini': {},
};

const openaiLanguageModelEntries: Readonly<
  Record<string, OpenAILanguageModelEntry>
> = Object.fromEntries(
  Object.entries(openaiLanguageModelDefinitions).map(
    ([modelId, definition]) => [
      modelId,
      createOpenAILanguageModelEntry(modelId, definition),
    ],
  ),
);

function createOpenAILanguageModelEntry(
  modelId: string,
  definition?: OpenAILanguageModelDefinition,
): OpenAILanguageModelEntry {
  const oSeriesVersion = getOSeriesVersion(modelId);
  const gptVersion = getGptVersion(modelId);
  const isRecognizedModelFamily =
    oSeriesVersion != null ||
    gptVersion != null ||
    /^gpt-4o(?:-|$)/.test(modelId);
  const isGptChatModel =
    gptVersion?.minor == null &&
    (gptVersion?.variant?.startsWith('chat') ?? false);
  const isGptNanoModel = gptVersion?.variant?.startsWith('nano') ?? false;
  const isGpt6OrLaterModel = gptVersion != null && gptVersion.major >= 6;
  const isGpt56OrLaterModel =
    isGpt6OrLaterModel ||
    (gptVersion?.major === 5 && (gptVersion.minor ?? 0) >= 6);
  // Pro, codex, and chat variants are excluded because their supported
  // efforts are not known.
  const isStandardGpt5Model =
    gptVersion?.major === 5 &&
    (gptVersion.variant == null ||
      /^(?:(?:mini|nano|sol|luna|terra)(?:-\d{4}-\d{2}-\d{2})?|\d{4}-\d{2}-\d{2})$/.test(
        gptVersion.variant,
      ));
  const supportsFlexProcessing =
    (oSeriesVersion != null && oSeriesVersion >= 3) ||
    (gptVersion != null && gptVersion.major >= 5 && !isGptChatModel);
  const supportsPriorityProcessing =
    modelId.startsWith('gpt-4') ||
    (gptVersion != null &&
      gptVersion.major >= 5 &&
      !isGptNanoModel &&
      !isGptChatModel) ||
    (oSeriesVersion != null && oSeriesVersion >= 3);
  const isReasoningModel =
    oSeriesVersion != null ||
    (gptVersion != null && gptVersion.major >= 5 && !isGptChatModel);
  const reasoningSampling: OpenAILanguageModelEntry['capabilities']['language']['reasoning']['sampling'] =
    definition?.capabilities?.language?.reasoning?.sampling ??
    (!isGpt6OrLaterModel &&
    gptVersion != null &&
    (gptVersion.major > 5 ||
      (gptVersion.major === 5 && (gptVersion.minor ?? 0) >= 1))
      ? 'reasoning-effort-none'
      : 'unsupported');
  const sampling: OpenAILanguageModelEntry['capabilities']['language']['sampling']['temperature'] =
    !isRecognizedModelFamily
      ? 'unknown'
      : !isReasoningModel
        ? true
        : reasoningSampling === 'reasoning-effort-none'
          ? { condition: 'Only when reasoning effort is none.' }
          : false;
  const chatTemperatureSupportedWithoutReasoning =
    !modelId.startsWith('gpt-4o-search-preview') &&
    !modelId.startsWith('gpt-4o-mini-search-preview');

  const entry: Omit<OpenAILanguageModelEntry, 'providerOptions'> = {
    capabilities: {
      language: {
        inputs: definition?.capabilities?.language?.inputs ?? {
          image: definition != null ? true : 'unknown',
          audio: definition != null ? false : 'unknown',
        },
        objectGeneration:
          definition?.capabilities?.language?.objectGeneration ??
          (definition != null ? true : 'unknown'),
        tools: definition?.capabilities?.language?.tools ?? {
          usage: definition != null ? true : 'unknown',
          streaming: definition != null ? true : 'unknown',
          async: isGpt6OrLaterModel,
        },
        reasoning: {
          support: isRecognizedModelFamily ? isReasoningModel : 'unknown',
          efforts:
            definition?.capabilities?.language?.reasoning?.efforts ??
            (isGpt6OrLaterModel
              ? ['low', 'medium', 'high', 'xhigh', 'max']
              : isStandardGpt5Model
                ? getGpt5ReasoningEfforts(gptVersion.minor ?? 0)
                : undefined),
          sampling: reasoningSampling,
        },
        sampling: {
          temperature: chatTemperatureSupportedWithoutReasoning
            ? sampling
            : {
                condition:
                  'Not supported by Chat Completions search preview models.',
              },
          topP: sampling,
          logprobs:
            isReasoningModel && !isGpt6OrLaterModel
              ? {
                  condition:
                    reasoningSampling === 'reasoning-effort-none'
                      ? 'Chat Completions requires reasoning effort none; Responses support is model-dependent.'
                      : 'Not supported by Chat Completions while reasoning; Responses support is model-dependent.',
                }
              : sampling,
        },
        serviceTiers: {
          flex: supportsFlexProcessing,
          priority: supportsPriorityProcessing,
        },
        configurationUpdates: isGpt6OrLaterModel,
        promptCache: {
          retention: !isGpt6OrLaterModel,
          // Prompt cache options are documented for GPT-5.6 and later.
          options: isRecognizedModelFamily ? isGpt56OrLaterModel : 'unknown',
        },
        endpoints: {
          chat: {
            temperatureWithoutReasoning:
              chatTemperatureSupportedWithoutReasoning,
            // GPT-5.6 rejects function tools with reasoning in Chat Completions.
            functionToolsWithReasoning: !(
              gptVersion?.major === 5 && (gptVersion.minor ?? 0) >= 6
            ),
          },
          responses: {
            logprobsRequireNonReasoning: isGpt6OrLaterModel,
          },
        },
      },
    },
    requestConfig: {
      language: {
        systemMessageMode:
          definition?.requestConfig?.language?.systemMessageMode ??
          (isReasoningModel ? 'developer' : 'system'),
      },
    },
  };

  // Options default to supported; exceptions reuse capabilities declared above.
  const { language } = entry.capabilities;
  return {
    ...entry,
    providerOptions: {
      language: declareProviderOptions(
        openaiProviderOptions.language,
        definition != null ? true : 'unknown',
        {
          logprobs: language.sampling.logprobs,
          maxToolCalls: language.tools.usage,
          parallelToolCalls: language.tools.usage,
          allowedTools: language.tools.usage,
          reasoningEffort: language.reasoning.support,
          reasoningSummary: language.reasoning.support,
          reasoningMode: language.reasoning.support,
          reasoningContext: language.reasoning.support,
          reasoningEffortUpdate: language.configurationUpdates,
          promptCacheOptions: language.promptCache.options,
          promptCacheRetention: language.promptCache.retention,
        },
      ),
    },
  };
}

/** Applies one default support value to every option, except the listed ones. */
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

function getGpt5ReasoningEfforts(minor: number): readonly string[] {
  if (minor === 0) {
    return ['minimal', 'low', 'medium', 'high'];
  }

  if (minor === 1) {
    return ['none', 'low', 'medium', 'high'];
  }

  if (minor < 6) {
    return ['none', 'low', 'medium', 'high', 'xhigh'];
  }

  return ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
}

function getOSeriesVersion(modelId: string): number | undefined {
  const match = /^o(\d+)(?:-|$)/.exec(modelId);
  return match == null ? undefined : Number(match[1]);
}

function getGptVersion(modelId: string):
  | {
      major: number;
      minor: number | undefined;
      variant: string | undefined;
    }
  | undefined {
  const match = /^gpt-(\d+)(?:\.(\d+))?(?:-(.+))?$/.exec(modelId);
  return match == null
    ? undefined
    : {
        major: Number(match[1]),
        minor: match[2] == null ? undefined : Number(match[2]),
        variant: match[3],
      };
}

type OperationModelEntry<Section extends keyof ModelCapabilities> = {
  readonly capabilities: {
    readonly [Key in Section]-?: NonNullable<ModelCapabilities[Key]>;
  };
};

export type OpenAIImageModelEntry = OperationModelEntry<'image'> & {
  readonly requestConfig: {
    readonly image: {
      readonly responseFormat: 'provider-default' | 'b64_json';
    };
  };
};

export type OpenAITranscriptionModelEntry =
  OperationModelEntry<'transcription'> & {
    readonly requestConfig: {
      readonly transcription: {
        readonly responseFormat?: 'verbose_json' | 'diarized_json';
        readonly chunkingStrategy?: 'auto';
        readonly languageField: 'language' | 'languages';
      };
    };
  };

const openaiEmbeddingModelEntries: Readonly<
  Record<string, OperationModelEntry<'embedding'>>
> = {
  'text-embedding-3-large': {
    capabilities: {
      embedding: { defaultDimensions: 3072, customDimensions: true },
    },
  },
  'text-embedding-3-small': {
    capabilities: {
      embedding: { defaultDimensions: 1536, customDimensions: true },
    },
  },
  'text-embedding-ada-002': {
    capabilities: {
      embedding: { defaultDimensions: 1536, customDimensions: false },
    },
  },
};

const gptImageSizes = ['1024x1024', '1536x1024', '1024x1536'];
const customImageSizes = {
  description: 'Standard presets and custom dimensions',
};

function createGptImageEntry(
  sizes: NonNullable<ModelCapabilities['image']>['sizes'],
): OpenAIImageModelEntry {
  return {
    capabilities: {
      image: {
        sizes,
        fileInput: true,
        maskInput: true,
        maxImagesPerCall: 10,
      },
    },
    requestConfig: { image: { responseFormat: 'provider-default' } },
  };
}

const openaiImageModelEntries: Readonly<Record<string, OpenAIImageModelEntry>> =
  {
    'gpt-image-2.5-flare': createGptImageEntry(customImageSizes),
    'gpt-image-2.5-sunburst': createGptImageEntry(customImageSizes),
    'gpt-image-2': createGptImageEntry(gptImageSizes),
    'gpt-image-1.5': createGptImageEntry(gptImageSizes),
    'gpt-image-1-mini': createGptImageEntry(gptImageSizes),
    'gpt-image-1': createGptImageEntry(gptImageSizes),
    'dall-e-3': {
      capabilities: {
        image: {
          sizes: ['1024x1024', '1792x1024', '1024x1792'],
          fileInput: false,
          maskInput: false,
          maxImagesPerCall: 1,
        },
      },
      requestConfig: { image: { responseFormat: 'b64_json' } },
    },
    'dall-e-2': {
      capabilities: {
        image: {
          sizes: ['256x256', '512x512', '1024x1024'],
          fileInput: true,
          maskInput: true,
          maxImagesPerCall: 10,
        },
      },
      requestConfig: { image: { responseFormat: 'b64_json' } },
    },
  };

const imageModelAliases: Readonly<Record<string, OpenAIImageModelEntry>> = {
  'gpt-image-2.5-flare-2026-09-08':
    openaiImageModelEntries['gpt-image-2.5-flare'],
  'gpt-image-2.5-sunburst-2026-09-08':
    openaiImageModelEntries['gpt-image-2.5-sunburst'],
  'chatgpt-image-latest': createGptImageEntry({ description: 'Unknown' }),
};

function resolveOpenAIImageModelEntry(modelId: string): OpenAIImageModelEntry {
  if (Object.prototype.hasOwnProperty.call(openaiImageModelEntries, modelId)) {
    return openaiImageModelEntries[modelId];
  }
  if (Object.prototype.hasOwnProperty.call(imageModelAliases, modelId)) {
    return imageModelAliases[modelId];
  }
  return {
    capabilities: {
      image: {
        sizes: { description: 'Unknown' },
        fileInput: 'unknown',
        maskInput: 'unknown',
        maxImagesPerCall: modelId.startsWith('gpt-image-') ? 10 : 1,
      },
    },
    requestConfig: {
      image: {
        responseFormat:
          modelId.startsWith('chatgpt-image-') ||
          modelId.startsWith('gpt-image-')
            ? 'provider-default'
            : 'b64_json',
      },
    },
  };
}

export const openaiImageModelMaxImagesPerCall: Record<string, number> =
  Object.fromEntries(
    Object.entries({ ...openaiImageModelEntries, ...imageModelAliases }).map(
      ([modelId, entry]) => [
        modelId,
        entry.capabilities.image.maxImagesPerCall ?? 1,
      ],
    ),
  );

const defaultTranscriptionRequestConfig: OpenAITranscriptionModelEntry['requestConfig']['transcription'] =
  {
    languageField: 'language',
  };

const openaiTranscriptionModelEntries: Readonly<
  Record<string, OpenAITranscriptionModelEntry>
> = {
  'whisper-1': {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: false,
        streamingDelay: false,
        duration: true,
        segments: true,
        language: true,
      },
    },
    requestConfig: {
      transcription: {
        ...defaultTranscriptionRequestConfig,
        responseFormat: 'verbose_json',
      },
    },
  },
  'gpt-4o-mini-transcribe': {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: false,
        streamingDelay: false,
        duration: false,
        segments: false,
        language: false,
      },
    },
    requestConfig: { transcription: defaultTranscriptionRequestConfig },
  },
  'gpt-4o-transcribe': {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: false,
        streamingDelay: false,
        duration: false,
        segments: false,
        language: false,
      },
    },
    requestConfig: { transcription: defaultTranscriptionRequestConfig },
  },
  'gpt-4o-transcribe-diarize': {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: false,
        streamingDelay: false,
        duration: true,
        segments: true,
        language: false,
      },
    },
    requestConfig: {
      transcription: {
        ...defaultTranscriptionRequestConfig,
        responseFormat: 'diarized_json',
        chunkingStrategy: 'auto',
      },
    },
  },
  'gpt-transcribe': {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: true,
        streamingDelay: false,
        duration: false,
        segments: false,
        language: true,
      },
    },
    requestConfig: { transcription: { languageField: 'languages' } },
  },
  'gpt-live-transcribe': {
    capabilities: {
      transcription: {
        transcription: false,
        streaming: true,
        streamingDelay: true,
        duration: false,
        segments: false,
        language: false,
      },
    },
    requestConfig: { transcription: { languageField: 'languages' } },
  },
  'gpt-realtime-whisper': {
    capabilities: {
      transcription: {
        transcription: false,
        streaming: true,
        streamingDelay: true,
        duration: false,
        segments: false,
        language: false,
      },
    },
    requestConfig: { transcription: defaultTranscriptionRequestConfig },
  },
};

const transcriptionSnapshotModelIds = [
  'gpt-transcribe',
  'gpt-live-transcribe',
  'gpt-realtime-whisper',
] as const;

function resolveOpenAITranscriptionModelEntry(
  modelId: string,
): OpenAITranscriptionModelEntry {
  if (
    Object.prototype.hasOwnProperty.call(
      openaiTranscriptionModelEntries,
      modelId,
    )
  ) {
    return openaiTranscriptionModelEntries[modelId];
  }
  for (const baseModelId of transcriptionSnapshotModelIds) {
    if (modelId.startsWith(`${baseModelId}-`)) {
      return openaiTranscriptionModelEntries[baseModelId];
    }
  }
  return {
    capabilities: {
      transcription: {
        transcription: 'unknown',
        streaming: 'unknown',
        streamingDelay: 'unknown',
        duration: 'unknown',
        segments: 'unknown',
        language: 'unknown',
      },
    },
    requestConfig: { transcription: defaultTranscriptionRequestConfig },
  };
}

const openaiSpeechTranslationModelEntries: Readonly<
  Record<string, OperationModelEntry<'speechTranslation'>>
> = {
  'gpt-realtime-translate': {
    capabilities: {
      speechTranslation: {
        translatedAudio: true,
        translatedText: true,
        sourceTranscript: true,
      },
    },
  },
};

const openaiSpeechModelEntries: Readonly<
  Record<string, OperationModelEntry<'speech'>>
> = {
  'tts-1': { capabilities: { speech: { instructions: false } } },
  'tts-1-hd': { capabilities: { speech: { instructions: false } } },
  'gpt-4o-mini-tts': { capabilities: { speech: { instructions: true } } },
};

type RealtimeRequestConfig = {
  api: 'live' | 'realtime';
  startup: 'session-start' | 'session-update';
  finalization: 'session-close' | 'transport-close';
};

type OpenAIRealtimeModelEntry = {
  capabilities: { realtime: NonNullable<ModelCapabilities['realtime']> };
  requestConfig: { realtime: RealtimeRequestConfig };
};

type OpenAIRequestConfig = {
  language?: OpenAILanguageModelEntry['requestConfig']['language'];
  image?: OpenAIImageModelEntry['requestConfig']['image'];
  transcription?: OpenAITranscriptionModelEntry['requestConfig']['transcription'];
  realtime?: RealtimeRequestConfig;
};

type OpenAIModelEntry = ModelEntry<OpenAIRequestConfig> & {
  capabilities: ModelCapabilities & {
    language?: OpenAILanguageModelEntry['capabilities']['language'];
  };
  providerOptions?: {
    language?: OpenAILanguageModelEntry['providerOptions']['language'];
  };
};

const liveModelEntry = {
  capabilities: {
    realtime: {
      conversation: 'continuous',
      transports: ['websocket', 'webrtc'],
      connections: ['server-websocket', 'webrtc'],
    },
  },
  requestConfig: {
    realtime: {
      api: 'live',
      startup: 'session-start',
      finalization: 'session-close',
    },
  },
} as const satisfies OpenAIRealtimeModelEntry;

const realtimeModelEntry = {
  capabilities: {
    realtime: {
      conversation: 'turn-based',
      transports: ['websocket'],
      connections: ['client-secret-websocket'],
    },
  },
  requestConfig: {
    realtime: {
      api: 'realtime',
      startup: 'session-update',
      finalization: 'transport-close',
    },
  },
} as const satisfies OpenAIRealtimeModelEntry;

const realtimeModelEntries = {
  'gpt-live-1': liveModelEntry,
  'gpt-realtime': realtimeModelEntry,
} as const;

export type OpenAIKnownLiveModelId = {
  [ModelId in keyof typeof realtimeModelEntries]: (typeof realtimeModelEntries)[ModelId]['requestConfig']['realtime']['api'] extends 'live'
    ? ModelId
    : never;
}[keyof typeof realtimeModelEntries];

/** Keep the existing realtime interface's shape while deriving it from the catalog. */
export const openaiLiveRealtimeCapabilities = {
  ...liveModelEntry.capabilities.realtime,
  startup: liveModelEntry.requestConfig.realtime.startup,
  finalization: liveModelEntry.requestConfig.realtime.finalization,
} as const;

/**
 * The catalog consumed by request builders and documentation. Source declarations
 * are grouped by operation; entries for the same model combine their sections.
 * An absent section is undeclared, not an instruction to reject a request.
 */
export const openaiModelCatalog: Readonly<Record<string, OpenAIModelEntry>> =
  combineModelEntries([
    openaiLanguageModelEntries,
    openaiEmbeddingModelEntries,
    openaiImageModelEntries,
    openaiTranscriptionModelEntries,
    openaiSpeechTranslationModelEntries,
    openaiSpeechModelEntries,
    realtimeModelEntries,
  ]);

function combineModelEntries(
  catalogs: ReadonlyArray<Readonly<Record<string, OpenAIModelEntry>>>,
): Record<string, OpenAIModelEntry> {
  const entries = new Map<string, OpenAIModelEntry>();
  for (const catalog of catalogs) {
    for (const [modelId, entry] of Object.entries(catalog)) {
      const previous = entries.get(modelId);
      entries.set(modelId, {
        capabilities: { ...previous?.capabilities, ...entry.capabilities },
        ...(previous?.providerOptions != null || entry.providerOptions != null
          ? {
              providerOptions: {
                ...previous?.providerOptions,
                ...entry.providerOptions,
              },
            }
          : {}),
        ...(previous?.requestConfig != null || entry.requestConfig != null
          ? {
              requestConfig: {
                ...previous?.requestConfig,
                ...entry.requestConfig,
              },
            }
          : {}),
      });
    }
  }
  return Object.fromEntries(entries);
}

function findModelEntry(modelId: string): OpenAIModelEntry | undefined {
  return Object.prototype.hasOwnProperty.call(openaiModelCatalog, modelId)
    ? openaiModelCatalog[modelId]
    : undefined;
}

export function getOpenAILanguageModelEntry(
  modelId: string,
): OpenAILanguageModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.language != null &&
    entry.providerOptions?.language != null &&
    entry.requestConfig?.language != null
    ? {
        capabilities: { language: entry.capabilities.language },
        providerOptions: { language: entry.providerOptions.language },
        requestConfig: { language: entry.requestConfig.language },
      }
    : createOpenAILanguageModelEntry(modelId);
}

export function getOpenAIImageModelEntry(
  modelId: string,
): OpenAIImageModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.image != null && entry.requestConfig?.image != null
    ? {
        capabilities: { image: entry.capabilities.image },
        requestConfig: { image: entry.requestConfig.image },
      }
    : resolveOpenAIImageModelEntry(modelId);
}

export function getOpenAITranscriptionModelEntry(
  modelId: string,
): OpenAITranscriptionModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.transcription != null &&
    entry.requestConfig?.transcription != null
    ? {
        capabilities: { transcription: entry.capabilities.transcription },
        requestConfig: { transcription: entry.requestConfig.transcription },
      }
    : resolveOpenAITranscriptionModelEntry(modelId);
}

export function getOpenAIRealtimeModelEntry(
  modelId: string,
  api?: 'live' | 'realtime',
): OpenAIRealtimeModelEntry {
  const entry = findModelEntry(modelId);
  if (
    entry?.capabilities.realtime != null &&
    entry.requestConfig?.realtime != null &&
    (api == null || entry.requestConfig.realtime.api === api)
  ) {
    return {
      capabilities: { realtime: entry.capabilities.realtime },
      requestConfig: { realtime: entry.requestConfig.realtime },
    };
  }
  return api === 'live' ? liveModelEntry : realtimeModelEntry;
}

export type OpenAILanguageModelCapabilities = {
  isReasoningModel: boolean;
  systemMessageMode: 'remove' | 'system' | 'developer';
  supportsFlexProcessing: boolean;
  supportsPriorityProcessing: boolean;
  supportsConfigurationUpdate: boolean;
  supportsAsyncToolCalling: boolean;
  supportedReasoningEfforts: readonly string[] | undefined;
  supportsChatFunctionToolsWithReasoning: boolean;
  supportsNonReasoningParameters: boolean;
};

/** Compatibility projection for callers that still consume the legacy shape. */
export function getOpenAILanguageModelCapabilities(
  modelId: string,
): OpenAILanguageModelCapabilities {
  const {
    capabilities: { language: capabilities },
    requestConfig: { language: requestConfig },
  } = getOpenAILanguageModelEntry(modelId);

  return {
    isReasoningModel: capabilities.reasoning.support === true,
    systemMessageMode: requestConfig.systemMessageMode,
    supportsFlexProcessing: capabilities.serviceTiers.flex,
    supportsPriorityProcessing: capabilities.serviceTiers.priority,
    supportsConfigurationUpdate: capabilities.configurationUpdates,
    supportsAsyncToolCalling: capabilities.tools.async,
    supportedReasoningEfforts: capabilities.reasoning.efforts,
    supportsChatFunctionToolsWithReasoning:
      capabilities.endpoints.chat.functionToolsWithReasoning,
    supportsNonReasoningParameters:
      capabilities.reasoning.sampling === 'reasoning-effort-none',
  };
}
