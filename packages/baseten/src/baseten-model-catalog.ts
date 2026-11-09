import type {
  OpenAICompatibleLanguageModelChatOptions,
  OpenAICompatibleLanguageModelCompletionOptions,
  OpenAICompatibleEmbeddingModelOptions,
} from '@ai-sdk/openai-compatible';
import type {
  ModelCapabilities,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { BasetenEmbeddingModelOptions } from './baseten-embedding-options';
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

const compatibleembeddingProviderOptions = {
  dimensions: {
    description:
      'The number of dimensions the resulting output embeddings should have.\nOnly supported in text-embedding-3 and later models.',
  },
  user: {
    description:
      'A unique identifier representing your end-user, which can help providers to\nmonitor and detect abuse.',
  },
} satisfies Record<
  keyof OpenAICompatibleEmbeddingModelOptions,
  ProviderOptionDefinition
>;

/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const basetenProviderOptions = {
  language: compatiblelanguageProviderOptions,
  embedding: {
    ...compatibleembeddingProviderOptions,
  } satisfies Record<
    keyof BasetenEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  'deepseek-ai/DeepSeek-R1-0528',
  'deepseek-ai/DeepSeek-V3-0324',
  'deepseek-ai/DeepSeek-V3.1',
  'moonshotai/Kimi-K2-Instruct-0905',
  'moonshotai/Kimi-K2-Thinking',
  'Qwen/Qwen3-235B-A22B-Instruct-2507',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'openai/gpt-oss-120b',
  'zai-org/GLM-4.6',
  'zai-org/GLM-4.7',
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
export const basetenRequestDefaults = {
  language: { supportsStructuredOutputs: true },
  embedding: { maxEmbeddingsPerCall: 128, supportsParallelCalls: true },
} as const;
export function getBasetenLanguageModelEntry(modelId: string) {
  const entry = {
    capabilities: {
      language: {
        ...(documentedLanguageCapabilities[modelId] ??
          unknownLanguageCapabilities),
        structuredOutput: { jsonSchema: true },
      },
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(basetenProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { language: basetenRequestDefaults.language },
  } as const;
  return entry satisfies ModelEntry<{
    language: typeof basetenRequestDefaults.language;
  }>;
}
/** Embedding deployments are selected by URL, so a model ID declares no fixed dimensions. */
export function getBasetenEmbeddingModelEntry(_modelId: string) {
  return {
    capabilities: {},
    providerOptions: {
      embedding: Object.fromEntries(
        Object.keys(basetenProviderOptions.embedding).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { embedding: basetenRequestDefaults.embedding },
  } satisfies ModelEntry<{
    embedding: typeof basetenRequestDefaults.embedding;
  }>;
}
export const basetenModelCatalog = Object.fromEntries(
  languageModelIds.map(id => [id, getBasetenLanguageModelEntry(id)]),
);
