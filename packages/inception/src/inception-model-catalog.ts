import type {
  ModelCapability,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { InceptionLanguageModelChatOptions } from './chat/inception-chat-language-model-options';

export const inceptionProviderOptions = {
  language: {
    reasoningEffort: {
      description: 'Controls how much the model deliberates before answering.',
    },
    strictJsonSchema: {
      description: 'Use strict JSON schema validation. Defaults to true.',
    },
    realtime: {
      description: 'Optimize for workloads with lower time to first token.',
    },
  } satisfies Record<
    keyof InceptionLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

function createChatModelEntry(
  efforts: readonly string[] = ['instant', 'low', 'medium', 'high'],
) {
  return {
    capabilities: {
      language: {
        inputs: { image: false, audio: false },
        objectGeneration: true,
        tools: { usage: true, streaming: true },
        reasoning: { support: true, efforts },
        sampling: { temperature: true, topP: false, logprobs: false },
      },
    },
    providerOptions: {
      language: {
        reasoningEffort: true,
        strictJsonSchema: {
          condition: 'Requires a JSON schema response format.',
        },
        realtime: true,
      } satisfies Record<
        keyof InceptionLanguageModelChatOptions,
        ModelCapability
      >,
    },
  } as const satisfies ModelEntry;
}

// https://docs.inceptionlabs.ai/get-started/models
export const inceptionModelCatalog = {
  'mercury-3': createChatModelEntry(),
  'mercury-2.5': createChatModelEntry(),
  'mercury-2': createChatModelEntry(),
  'mercury-voice': createChatModelEntry(['low', 'medium', 'high']),
} as const satisfies Record<string, ModelEntry>;
