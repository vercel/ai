import type {
  ModelCapabilities,
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { DeepSeekLanguageModelChatOptions } from './chat/deepseek-chat-language-model-options';

export const deepseekProviderOptions = {
  language: {
    logprobs: { description: 'Return token log probabilities.' },
    topLogprobs: {
      description: 'Number of token log probabilities to return.',
    },
    userId: { description: 'End-user identifier for request isolation.' },
    thinking: { description: 'Enable or disable thinking.' },
    reasoningEffort: { description: 'Thinking strength for reasoning models.' },
    strictJsonSchema: {
      description: 'Use strict JSON schema validation on supporting endpoints.',
    },
  } satisfies Record<
    keyof DeepSeekLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export type DeepSeekEndpointOptions = {
  supportsAssistantPrefixCompletion?: boolean;
  supportsStrictToolCalls?: boolean;
  supportsPenaltySampling?: boolean;
  supportsThinking?: boolean;
  supportsStructuredOutputs?: boolean;
};

type LanguageCapabilities = NonNullable<ModelCapabilities['language']> & {
  textGeneration: ModelCapability;
  tools: NonNullable<ModelCapabilities['language']>['tools'] & {
    strict: boolean | 'unknown';
  };
  reasoning: NonNullable<ModelCapabilities['language']>['reasoning'] & {
    configurable: boolean;
    enabledByDefault: boolean;
    assistantHistory: boolean;
  };
  sampling: NonNullable<ModelCapabilities['language']>['sampling'] & {
    penalties: boolean;
    topK: false;
    seed: false;
  };
  structuredOutput: { jsonSchema: boolean };
  endpoints: { assistantPrefixCompletion: boolean };
};

export type DeepSeekLanguageModelEntry = ModelEntry & {
  capabilities: { language: LanguageCapabilities };
  providerOptions: {
    language: Record<keyof DeepSeekLanguageModelChatOptions, ModelCapability>;
  };
};

// Preserve the provider page's model set and its image-input exception.
const languageDefinitions: Record<string, boolean> = {
  'deepseek-flash': false,
  'deepseek-v4-flash': false,
  'deepseek-v4-pro': false,
  'deepseek-v4-flash-vision-exp': true,
};

function createLanguageModelEntry(
  modelId: string,
  image?: boolean,
): DeepSeekLanguageModelEntry {
  // Legacy aliases and pre-V4 IDs retain their previous protocol. Unknown IDs
  // inherit the current protocol, including assistant reasoning history.
  const assistantHistory =
    !/(^|[/.])deepseek-(?:chat|reasoner|v[1-3](?:\.\d+)?)(?=[-/:.]|$)/.test(
      modelId,
    );
  const support = image != null ? true : 'unknown';
  const language: LanguageCapabilities = {
    textGeneration: support,
    inputs: { image: image ?? 'unknown', audio: false },
    objectGeneration: support,
    tools: { usage: support, streaming: support, strict: 'unknown' },
    reasoning: {
      support,
      ...(image != null ? { efforts: ['low', 'high', 'max'] } : {}),
      configurable: true,
      enabledByDefault: modelId === 'deepseek-reasoner' || assistantHistory,
      assistantHistory,
    },
    sampling: {
      temperature: { condition: 'Only effective when thinking is disabled.' },
      topP: { condition: 'Only effective when thinking is disabled.' },
      logprobs: support,
      penalties: false,
      topK: false,
      seed: false,
    },
    structuredOutput: { jsonSchema: false },
    endpoints: { assistantPrefixCompletion: false },
  };
  return {
    capabilities: { language },
    providerOptions: {
      language: {
        logprobs: language.sampling.logprobs,
        topLogprobs: language.sampling.logprobs,
        userId: support,
        thinking: language.reasoning.support,
        reasoningEffort: language.reasoning.support,
        strictJsonSchema: {
          condition:
            'Requires a serving endpoint with JSON schema response formatting.',
        },
      },
    },
  };
}

export const deepseekModelCatalog: Readonly<
  Record<string, DeepSeekLanguageModelEntry>
> = Object.fromEntries(
  Object.entries(languageDefinitions).map(([modelId, image]) => [
    modelId,
    createLanguageModelEntry(modelId, image),
  ]),
);

export function getDeepSeekLanguageModelEntry(
  modelId: string,
  endpoint: DeepSeekEndpointOptions = {},
): DeepSeekLanguageModelEntry {
  const entry = Object.prototype.hasOwnProperty.call(
    deepseekModelCatalog,
    modelId,
  )
    ? deepseekModelCatalog[modelId]
    : createLanguageModelEntry(modelId);
  const { language } = entry.capabilities;
  return {
    ...entry,
    capabilities: {
      language: {
        ...language,
        tools: {
          ...language.tools,
          strict: endpoint.supportsStrictToolCalls ?? 'unknown',
        },
        reasoning: {
          ...language.reasoning,
          configurable: endpoint.supportsThinking !== false,
        },
        sampling: {
          ...language.sampling,
          penalties: endpoint.supportsPenaltySampling === true,
        },
        structuredOutput: {
          jsonSchema: endpoint.supportsStructuredOutputs === true,
        },
        endpoints: {
          assistantPrefixCompletion:
            endpoint.supportsAssistantPrefixCompletion === true,
        },
      },
    },
  };
}
