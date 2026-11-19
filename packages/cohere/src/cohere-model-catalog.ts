import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { CohereLanguageModelChatOptions } from './cohere-chat-language-model-options';
import type { CohereEmbeddingModelOptions } from './cohere-embedding-model-options';
import type { CohereRerankingModelOptions } from './reranking/cohere-reranking-model-options';

export const cohereProviderOptions = {
  language: {
    thinking: {
      description: 'Enable or disable reasoning and set its token budget.',
    },
  } satisfies Record<
    keyof CohereLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
  embedding: {
    embeddingType: { description: 'Embedding format returned by the API.' },
    inputType: { description: 'Intended use of the input embeddings.' },
    truncate: {
      description: 'How to truncate inputs exceeding the token limit.',
    },
    outputDimension: { description: 'Output embedding dimensions.' },
  } satisfies Record<
    keyof CohereEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  reranking: {
    maxTokensPerDoc: { description: 'Token limit for each document.' },
    priority: { description: 'Request processing priority.' },
  } satisfies Record<
    keyof CohereRerankingModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

type LanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  reasoning: NonNullable<ModelCapabilities['language']>['reasoning'] & {
    maxBudget: number;
  };
};

type LanguageRequestConfig = {
  thinkingType: 'enabled';
  reasoningMaxOutputTokens: number;
};

type EmbeddingType = NonNullable<CohereEmbeddingModelOptions['embeddingType']>;

type EmbeddingCapabilities = NonNullable<ModelCapabilities['embedding']> & {
  dimensions: readonly number[];
  embeddingTypes: readonly EmbeddingType[];
  maxEmbeddingsPerCall: number;
  supportsParallelCalls: boolean;
};

type EmbeddingRequestConfig = {
  embeddingType: EmbeddingType;
  inputType: NonNullable<CohereEmbeddingModelOptions['inputType']>;
};

export type CohereLanguageModelEntry = {
  capabilities: { language: LanguageCapabilities };
  providerOptions: {
    language: Record<keyof CohereLanguageModelChatOptions, ModelCapability>;
  };
  requestConfig: { language: LanguageRequestConfig };
};

type CohereEmbeddingModelEntry = {
  // Unknown model IDs do not invent a default dimension.
  capabilities: { embedding?: EmbeddingCapabilities };
  providerOptions: {
    embedding: Record<keyof CohereEmbeddingModelOptions, ModelCapability>;
  };
  requestConfig: { embedding: EmbeddingRequestConfig };
};

type CohereRerankingModelEntry = {
  capabilities: { reranking: NonNullable<ModelCapabilities['reranking']> };
  providerOptions: {
    reranking: Record<keyof CohereRerankingModelOptions, ModelCapability>;
  };
};

type CohereModelEntry = ModelEntry<{
  language?: LanguageRequestConfig;
  embedding?: EmbeddingRequestConfig;
}> & {
  capabilities: ModelCapabilities & {
    language?: LanguageCapabilities;
    embedding?: EmbeddingCapabilities;
  };
  providerOptions?: {
    [Section in keyof typeof cohereProviderOptions]?: Record<
      keyof (typeof cohereProviderOptions)[Section],
      ModelCapability
    >;
  };
};

type LanguageDefinition = {
  image: boolean;
  objectGeneration: boolean;
  tools: boolean;
  reasoning?: boolean;
};

const standard = { image: false, objectGeneration: true, tools: true };
const legacy = { image: false, objectGeneration: false, tools: false };

// Preserve the provider page's model set and per-model exceptions.
const languageDefinitions = {
  'command-a-03-2025': standard,
  'command-a-reasoning-08-2025': { ...standard, reasoning: true },
  'command-a-vision-07-2025': { ...standard, image: true },
  'command-r7b-12-2024': standard,
  'command-r-plus-04-2024': standard,
  'command-r-plus': standard,
  'command-r-08-2024': standard,
  'command-r-03-2024': standard,
  'command-r': standard,
  command: legacy,
  'command-nightly': legacy,
  'command-light': legacy,
  'command-light-nightly': legacy,
} satisfies Record<string, LanguageDefinition>;

function createLanguageModelEntry(
  definition?: LanguageDefinition,
): CohereLanguageModelEntry {
  const reasoningSupport = definition?.reasoning ?? 'unknown';
  return {
    capabilities: {
      language: {
        inputs: { image: definition?.image ?? 'unknown', audio: false },
        objectGeneration: definition?.objectGeneration ?? 'unknown',
        tools: {
          usage: definition?.tools ?? 'unknown',
          streaming: definition?.tools ?? 'unknown',
        },
        reasoning: { support: reasoningSupport, maxBudget: 32768 },
        sampling: { temperature: 'unknown', topP: 'unknown', logprobs: false },
      },
    },
    providerOptions: {
      language: declareProviderOptions(
        cohereProviderOptions.language,
        definition != null ? true : 'unknown',
        { thinking: reasoningSupport },
      ),
    },
    requestConfig: {
      language: { thinkingType: 'enabled', reasoningMaxOutputTokens: 32768 },
    },
  };
}

// These SDK limits apply to custom model IDs as well as catalog models.
export const cohereEmbeddingModelLimits = {
  maxEmbeddingsPerCall: 96,
  supportsParallelCalls: true,
} as const;

const embeddingRequestConfig: EmbeddingRequestConfig = {
  embeddingType: 'float',
  inputType: 'search_query',
};

const embeddingTypes: readonly EmbeddingType[] = [
  'float',
  'int8',
  'uint8',
  'binary',
  'ubinary',
];

function createEmbeddingModelEntry(
  defaultDimensions: number,
  dimensions: readonly number[],
  formats: readonly EmbeddingType[] = embeddingTypes,
) {
  const customDimensions = dimensions.length > 1;
  return {
    capabilities: {
      embedding: {
        defaultDimensions,
        customDimensions,
        dimensions,
        embeddingTypes: formats,
        ...cohereEmbeddingModelLimits,
      },
    },
    providerOptions: {
      embedding: declareProviderOptions(cohereProviderOptions.embedding, true, {
        outputDimension: customDimensions,
        embeddingType:
          formats.length === 1
            ? { condition: "Only embeddingType: 'float' is supported." }
            : true,
      }),
    },
    requestConfig: { embedding: embeddingRequestConfig },
  };
}

function createRerankingModelEntry(
  declared: boolean,
): CohereRerankingModelEntry {
  const support = declared ? true : 'unknown';
  return {
    capabilities: {
      reranking: {
        documents: {
          text: support,
          object: declared
            ? {
                condition:
                  'Objects are converted to JSON strings with a compatibility warning.',
              }
            : 'unknown',
        },
        topN: support,
      },
    },
    providerOptions: {
      reranking: declareProviderOptions(
        cohereProviderOptions.reranking,
        support,
        {},
      ),
    },
  };
}

const cohereEmbeddingModelEntries = {
  'embed-v5.0-pro': createEmbeddingModelEntry(
    2048,
    [256, 512, 768, 1024, 1536, 2048],
  ),
  'embed-v5.0-fast': createEmbeddingModelEntry(
    2048,
    [256, 512, 768, 1024, 1536, 2048],
  ),
  'embed-v4.0': createEmbeddingModelEntry(1536, [256, 512, 1024, 1536]),
  'embed-english-v3.0': createEmbeddingModelEntry(1024, [1024]),
  'embed-multilingual-v3.0': createEmbeddingModelEntry(1024, [1024]),
  'embed-english-light-v3.0': createEmbeddingModelEntry(384, [384]),
  'embed-multilingual-light-v3.0': createEmbeddingModelEntry(384, [384]),
  'embed-english-v2.0': createEmbeddingModelEntry(4096, [4096], ['float']),
  'embed-english-light-v2.0': createEmbeddingModelEntry(
    1024,
    [1024],
    ['float'],
  ),
  'embed-multilingual-v2.0': createEmbeddingModelEntry(768, [768], ['float']),
};

const cohereRerankingModelEntries = {
  'rerank-v4.0-pro': createRerankingModelEntry(true),
  'rerank-v4.0-fast': createRerankingModelEntry(true),
  'rerank-v3.5': createRerankingModelEntry(true),
  'rerank-english-v3.0': createRerankingModelEntry(true),
  'rerank-multilingual-v3.0': createRerankingModelEntry(true),
};

export const cohereModelCatalog: Readonly<Record<string, CohereModelEntry>> = {
  ...Object.fromEntries(
    Object.entries(languageDefinitions).map(([modelId, definition]) => [
      modelId,
      createLanguageModelEntry(definition),
    ]),
  ),
  ...cohereEmbeddingModelEntries,
  ...cohereRerankingModelEntries,
};

function findModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(cohereModelCatalog, modelId)
    ? cohereModelCatalog[modelId]
    : undefined;
}

export function getCohereLanguageModelEntry(
  modelId: string,
): CohereLanguageModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.language != null &&
    entry.providerOptions?.language != null &&
    entry.requestConfig?.language != null
    ? {
        capabilities: { language: entry.capabilities.language },
        providerOptions: { language: entry.providerOptions.language },
        requestConfig: { language: entry.requestConfig.language },
      }
    : createLanguageModelEntry();
}

export function getCohereEmbeddingModelEntry(
  modelId: string,
): CohereEmbeddingModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.embedding != null &&
    entry.providerOptions?.embedding != null &&
    entry.requestConfig?.embedding != null
    ? {
        capabilities: { embedding: entry.capabilities.embedding },
        providerOptions: { embedding: entry.providerOptions.embedding },
        requestConfig: { embedding: entry.requestConfig.embedding },
      }
    : {
        capabilities: {},
        providerOptions: {
          embedding: declareProviderOptions(
            cohereProviderOptions.embedding,
            'unknown',
            {},
          ),
        },
        requestConfig: { embedding: embeddingRequestConfig },
      };
}

export function getCohereRerankingModelEntry(
  modelId: string,
): CohereRerankingModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.reranking != null &&
    entry.providerOptions?.reranking != null
    ? {
        capabilities: { reranking: entry.capabilities.reranking },
        providerOptions: { reranking: entry.providerOptions.reranking },
      }
    : createRerankingModelEntry(false);
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
export type CohereModelIds = {
  language: keyof typeof languageDefinitions;
  embedding: keyof typeof cohereEmbeddingModelEntries;
  reranking: keyof typeof cohereRerankingModelEntries;
};
