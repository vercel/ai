import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { PerplexityEmbeddingModelOptions } from './perplexity-embedding-model-options';
import type { PerplexityLanguageModelOptions } from './perplexity-language-model-options';
import type { PerplexityAgentPreset } from './perplexity-options';

// The Agent API schema deliberately accepts additional passthrough options.
// Check every named option without requiring definitions for arbitrary keys.
type NamedOptions<Options> = {
  [Key in keyof Options as string extends Key
    ? never
    : number extends Key
      ? never
      : Key]: Options[Key];
};

type LanguageOptions = NamedOptions<PerplexityLanguageModelOptions>;

export const perplexityProviderOptions = {
  language: {
    instructions: { description: 'Top-level Agent API instructions.' },
    tools: { description: 'Native Agent API tools.' },
    models: { description: 'Fallback models for Agent API routing.' },
    max_steps: { description: 'Maximum number of agentic steps.' },
    max_tool_calls: { description: 'Maximum number of native tool calls.' },
    previous_response_id: {
      description: 'Continue an earlier Agent API response.',
    },
    store: { description: 'Allow later retrieval of the response.' },
    language_preference: { description: 'Preferred response language.' },
    reasoning: { description: 'Agent API reasoning configuration.' },
    skills: { description: 'Agent API skill configuration.' },
  } satisfies Record<keyof LanguageOptions, ProviderOptionDefinition>,
  embedding: {
    dimensions: {
      description: 'Output dimensions through Matryoshka truncation.',
    },
    encodingFormat: { description: 'Quantized embedding encoding format.' },
  } satisfies Record<
    keyof PerplexityEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  // Decisions has no provider-specific options; the adapter warns and omits them.
  decision: {},
} as const satisfies ProviderOptionDefinitions;

type LanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  sampling: NonNullable<ModelCapabilities['language']>['sampling'] & {
    topK: false;
    frequencyPenalty: false;
    presencePenalty: false;
    stopSequences: false;
    seed: false;
  };
};

type LanguageRequestConfig = {
  selection: { model: string } | { preset: PerplexityAgentPreset };
  strictJsonSchema: boolean;
};

// These adapter limits apply to custom IDs as well as catalog models.
export const perplexityEmbeddingModelLimits = {
  maxEmbeddingsPerCall: 512,
  supportsParallelCalls: true,
} as const;

type EmbeddingCapabilities = NonNullable<ModelCapabilities['embedding']> &
  typeof perplexityEmbeddingModelLimits & {
    minimumDimensions: number;
    encodingFormats: readonly NonNullable<
      PerplexityEmbeddingModelOptions['encodingFormat']
    >[];
  };

type EmbeddingRequestConfig = {
  encodingFormat: NonNullable<
    PerplexityEmbeddingModelOptions['encodingFormat']
  >;
};

export const perplexityDecisionModelLimits = {
  supportedQuestionTypes: ['choice', 'score', 'boolean'],
  maxQuestions: 128,
  maxChoiceOptions: 255,
  maxScoreLevels: 10,
  maxImages: 8,
  supportedMediaTypes: ['image/png', 'image/jpeg', 'image/webp'],
} as const;

type DecisionCapabilities = NonNullable<ModelCapabilities['decision']> &
  typeof perplexityDecisionModelLimits;

type PerplexityLanguageModelEntry = {
  capabilities: { language: LanguageCapabilities };
  providerOptions: { language: Record<keyof LanguageOptions, ModelCapability> };
  requestConfig: { language: LanguageRequestConfig };
};

type PerplexityEmbeddingModelEntry = {
  capabilities: { embedding?: EmbeddingCapabilities };
  providerOptions: {
    embedding: Record<keyof PerplexityEmbeddingModelOptions, ModelCapability>;
  };
  requestConfig: { embedding: EmbeddingRequestConfig };
};

type PerplexityDecisionModelEntry = {
  capabilities: { decision: DecisionCapabilities };
  providerOptions: { decision: Record<string, never> };
};

type PerplexityModelEntry = ModelEntry<{
  language?: LanguageRequestConfig;
  embedding?: EmbeddingRequestConfig;
}> & {
  capabilities: ModelCapabilities & {
    language?: LanguageCapabilities;
    embedding?: EmbeddingCapabilities;
    decision?: DecisionCapabilities;
  };
  providerOptions?: {
    language?: Record<keyof LanguageOptions, ModelCapability>;
    embedding?: Record<keyof PerplexityEmbeddingModelOptions, ModelCapability>;
    decision?: Record<string, never>;
  };
};

function createLanguageModelEntry(
  modelId: string,
  preset?: PerplexityAgentPreset,
): PerplexityLanguageModelEntry {
  const support = preset != null ? true : 'unknown';
  const reasoning: ModelCapability =
    preset != null
      ? {
          condition:
            'Availability and effort levels depend on the routed model.',
        }
      : 'unknown';
  return {
    capabilities: {
      language: {
        inputs: { image: support, audio: false },
        objectGeneration: support,
        tools: { usage: support, streaming: support },
        reasoning: { support: reasoning },
        sampling: {
          temperature: 'unknown',
          topP: 'unknown',
          logprobs: false,
          topK: false,
          frequencyPenalty: false,
          presencePenalty: false,
          stopSequences: false,
          seed: false,
        },
      },
    },
    providerOptions: {
      language: declareProviderOptions(
        perplexityProviderOptions.language,
        support,
        { reasoning },
      ),
    },
    requestConfig: {
      language: {
        selection: preset != null ? { preset } : { model: modelId },
        strictJsonSchema: true,
      },
    },
  };
}

const embeddingRequestConfig: EmbeddingRequestConfig = {
  encodingFormat: 'base64_int8',
};

function createEmbeddingModelEntry(
  defaultDimensions: number,
): PerplexityEmbeddingModelEntry {
  return {
    capabilities: {
      embedding: {
        defaultDimensions,
        customDimensions: true,
        minimumDimensions: 128,
        encodingFormats: ['base64_int8', 'base64_binary'],
        ...perplexityEmbeddingModelLimits,
      },
    },
    providerOptions: {
      embedding: declareProviderOptions(
        perplexityProviderOptions.embedding,
        true,
        {},
      ),
    },
    requestConfig: { embedding: embeddingRequestConfig },
  };
}

function createDecisionModelEntry(
  declared: boolean,
): PerplexityDecisionModelEntry {
  const support = declared ? true : 'unknown';
  return {
    capabilities: {
      decision: {
        questionTypes: {
          boolean: support,
          choice: support,
          score: support,
          box: false,
        },
        inputs: { image: support },
        reasoning: false,
        maxOutputTokens: false,
        ...perplexityDecisionModelLimits,
      },
    },
    providerOptions: { decision: {} },
  };
}

// Preserve the documented preset and embedding sets and all existing decision IDs.
const perplexityEmbeddingModelEntries = {
  'pplx-embed-v1-0.6b': createEmbeddingModelEntry(1024),
  'pplx-embed-v1-4b': createEmbeddingModelEntry(2560),
};

const perplexityDecisionModelEntries = {
  'pplx-decider-v1.2': createDecisionModelEntry(true),
  'pplx-decider-flash-v1.2': createDecisionModelEntry(true),
  'pplx-decider-latest': createDecisionModelEntry(true),
  'pplx-decider-flash-latest': createDecisionModelEntry(true),
  'perplexity/pplx-decider-latest': createDecisionModelEntry(true),
  'perplexity/pplx-decider-flash-latest': createDecisionModelEntry(true),
  'pplx-decider-v1.1-27b': createDecisionModelEntry(true),
  'pplx-decider-v1-27b': createDecisionModelEntry(true),
};

const languageModelIds = ['fast', 'low', 'medium', 'high', 'xhigh'] as const;

const perplexityLanguageModelEntries = Object.fromEntries(
  languageModelIds.map(preset => [
    preset,
    createLanguageModelEntry(preset, preset),
  ]),
);

export const perplexityModelCatalog: Readonly<
  Record<string, PerplexityModelEntry>
> = {
  ...perplexityLanguageModelEntries,
  ...perplexityEmbeddingModelEntries,

  ...perplexityDecisionModelEntries,
};

function findModelEntry(modelId: string) {
  return Object.prototype.hasOwnProperty.call(perplexityModelCatalog, modelId)
    ? perplexityModelCatalog[modelId]
    : undefined;
}

export function getPerplexityLanguageModelEntry(
  modelId: string,
): PerplexityLanguageModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.language != null &&
    entry.providerOptions?.language != null &&
    entry.requestConfig?.language != null
    ? {
        capabilities: { language: entry.capabilities.language },
        providerOptions: { language: entry.providerOptions.language },
        requestConfig: { language: entry.requestConfig.language },
      }
    : createLanguageModelEntry(modelId);
}

export function getPerplexityEmbeddingModelEntry(
  modelId: string,
): PerplexityEmbeddingModelEntry {
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
        // Unknown IDs do not invent a default dimension or gain new validation.
        capabilities: {},
        providerOptions: {
          embedding: declareProviderOptions(
            perplexityProviderOptions.embedding,
            'unknown',
            {},
          ),
        },
        requestConfig: { embedding: embeddingRequestConfig },
      };
}

export function getPerplexityDecisionModelEntry(
  modelId: string,
): PerplexityDecisionModelEntry {
  const entry = findModelEntry(modelId);
  return entry?.capabilities.decision != null
    ? {
        capabilities: { decision: entry.capabilities.decision },
        providerOptions: { decision: {} },
      }
    : createDecisionModelEntry(false);
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
export type PerplexityModelIds = {
  embedding: keyof typeof perplexityEmbeddingModelEntries;
  decision: keyof typeof perplexityDecisionModelEntries;
  language: (typeof languageModelIds)[number];
};
