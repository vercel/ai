import type {
  OpenAICompatibleLanguageModelChatOptions,
  OpenAICompatibleLanguageModelCompletionOptions,
} from '@ai-sdk/openai-compatible';
import type {
  ModelCapabilities,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { GmicloudLanguageModelChatOptions } from './gmicloud-chat-language-model-options';
const compatiblelanguageProviderOptions = {
  user: {
    description:
      'A unique identifier representing your end-user, which can help providers to\nmonitor and detect abuse.',
  },
  reasoningEffort: {
    description:
      'Reasoning effort for reasoning models. Defaults to `medium`.\n\nSet to `null` to send `"reasoning_effort": null`, for providers that treat\nan explicit `null` differently from an omitted field.',
  },
  textVerbosity: {
    description:
      'Controls the verbosity of the generated text. Defaults to `medium`.',
  },
  strictJsonSchema: {
    description:
      'Whether to use strict JSON schema validation.\nWhen true, the model uses constrained decoding to guarantee schema compliance.\nOnly used when the provider supports structured outputs and a schema is provided.',
  },
  echo: { description: 'Echo back the prompt in addition to the completion.' },
  logitBias: {
    description:
      'Modify the likelihood of specified tokens appearing in the completion.\n\nAccepts a JSON object that maps tokens (specified by their token ID in\nthe GPT tokenizer) to an associated bias value from -100 to 100.',
  },
  suffix: {
    description: 'The suffix that comes after a completion of inserted text.',
  },
} satisfies Record<
  | keyof OpenAICompatibleLanguageModelChatOptions
  | keyof OpenAICompatibleLanguageModelCompletionOptions,
  ProviderOptionDefinition
>;

/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const gmicloudProviderOptions = {
  language: {
    ...compatiblelanguageProviderOptions,
  } satisfies Record<
    keyof GmicloudLanguageModelChatOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  'deepseek-ai/DeepSeek-V4-Flash-0731',
  'Qwen/Qwen3.8-Max',
  'moonshotai/kimi-k3',
  'zai-org/GLM-5.2-FP8',
  'MiniMaxAI/MiniMax-M3',
] as const;
const documentedLanguageCapabilities: Record<
  string,
  NonNullable<ModelCapabilities['language']>
> = {};
const unknownLanguageCapabilities: NonNullable<ModelCapabilities['language']> =
  {
    inputs: { image: 'unknown', audio: 'unknown' },
    objectGeneration: 'unknown',
    tools: { usage: 'unknown', streaming: 'unknown' },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  };
export function getGmicloudLanguageModelEntry(modelId: string) {
  return {
    capabilities: {
      language:
        documentedLanguageCapabilities[modelId] ?? unknownLanguageCapabilities,
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(gmicloudProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const gmicloudModelCatalog = Object.fromEntries(
  languageModelIds.map(id => [id, getGmicloudLanguageModelEntry(id)]),
);
