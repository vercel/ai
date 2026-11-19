import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { CerebrasLanguageModelChatOptions } from './cerebras-chat-language-model-options';

export const cerebrasProviderOptions = {
  language: {
    user: { description: 'End-user identifier for abuse monitoring.' },
    strictJsonSchema: { description: 'Use strict JSON schema validation.' },
    parallelToolCalls: { description: 'Allow parallel function calls.' },
    logprobs: { description: 'Return token log probabilities.' },
    topLogprobs: {
      description: 'Number of token log probabilities to return.',
    },
    logitBias: { description: 'Bias token selection by token ID.' },
    serviceTier: { description: 'Request processing tier.' },
    queueThreshold: { description: 'Maximum acceptable flex queue time.' },
    reasoningEffort: {
      description: 'Reasoning effort for configurable models.',
    },
    reasoningFormat: { description: 'Format of the returned reasoning.' },
    prediction: { description: 'Predicted output content.' },
    promptCacheKey: { description: 'Cache affinity key for shared prompts.' },
  } satisfies Record<
    keyof CerebrasLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

type LanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  structuredOutput: { jsonSchema: boolean };
};

type CerebrasLanguageModelEntry = ModelEntry & {
  capabilities: { language: LanguageCapabilities };
  providerOptions: {
    language: Record<keyof CerebrasLanguageModelChatOptions, ModelCapability>;
  };
};

// Preserve the provider page's model set and image-input exception.
const languageDefinitions = {
  'gpt-oss-120b': false,
  'gemma-4-31b': true,
} satisfies Record<string, boolean>;

function createLanguageModelEntry(image?: boolean): CerebrasLanguageModelEntry {
  const support = image != null ? true : 'unknown';
  const language: LanguageCapabilities = {
    inputs: { image: image ?? 'unknown', audio: false },
    objectGeneration: support,
    tools: { usage: support, streaming: support },
    reasoning: { support },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: support },
    // Keep forwarding JSON schemas for custom IDs as the existing provider does.
    structuredOutput: { jsonSchema: true },
  };
  return {
    capabilities: { language },
    providerOptions: {
      language: declareProviderOptions(
        cerebrasProviderOptions.language,
        support,
        {
          strictJsonSchema: {
            condition: 'Requires a JSON schema response format.',
          },
          serviceTier: {
            condition: 'Requires a preview-enabled dedicated endpoint.',
          },
          queueThreshold: {
            condition:
              'Requires flex/auto on a preview-enabled dedicated endpoint.',
          },
          reasoningEffort:
            image != null
              ? { condition: 'Supported values depend on the reasoning model.' }
              : 'unknown',
          reasoningFormat:
            image != null
              ? {
                  condition: 'Available formats depend on the reasoning model.',
                }
              : 'unknown',
        },
      ),
    },
  };
}

export const cerebrasModelCatalog: Readonly<
  Record<string, CerebrasLanguageModelEntry>
> = Object.fromEntries(
  Object.entries(languageDefinitions).map(([modelId, image]) => [
    modelId,
    createLanguageModelEntry(image),
  ]),
);

export function getCerebrasLanguageModelEntry(
  modelId: string,
): CerebrasLanguageModelEntry {
  return Object.prototype.hasOwnProperty.call(cerebrasModelCatalog, modelId)
    ? cerebrasModelCatalog[modelId]
    : createLanguageModelEntry();
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
export type CerebrasModelIds = {
  language: keyof typeof languageDefinitions;
};
