import type {
  ModelCapabilities,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { HuggingFaceLanguageModelResponsesOptions } from './responses/huggingface-responses-language-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const huggingFaceProviderOptions = {
  language: {
    metadata: { description: 'metadata' },
    instructions: { description: 'instructions' },
    strictJsonSchema: { description: 'strictJsonSchema' },
    reasoningEffort: { description: 'reasoningEffort' },
  } satisfies Record<
    keyof HuggingFaceLanguageModelResponsesOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  'meta-llama/Llama-3.1-8B-Instruct',
  'meta-llama/Llama-3.1-70B-Instruct',
  'meta-llama/Llama-3.1-405B-Instruct',
  'meta-llama/Llama-3.3-70B-Instruct',
  'meta-llama/Meta-Llama-3-8B-Instruct',
  'meta-llama/Meta-Llama-3-70B-Instruct',
  'meta-llama/Llama-3.2-3B-Instruct',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'meta-llama/Llama-Guard-4-12B',
  'deepseek-ai/DeepSeek-V3.1',
  'deepseek-ai/DeepSeek-V3-0324',
  'deepseek-ai/DeepSeek-R1',
  'deepseek-ai/DeepSeek-R1-0528',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
  'deepseek-ai/DeepSeek-R1-Distill-Llama-8B',
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
  'deepseek-ai/DeepSeek-Prover-V2-671B',
  'Qwen/Qwen3-32B',
  'Qwen/Qwen3-14B',
  'Qwen/Qwen3-8B',
  'Qwen/Qwen3-4B',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
  'Qwen/Qwen3-30B-A3B',
  'Qwen/Qwen2.5-VL-7B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-Coder-7B-Instruct',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'google/gemma-2-9b-it',
  'google/gemma-3-27b-it',
  'moonshotai/Kimi-K2-Instruct',
] as const;
const documentedLanguageCapabilities: Record<
  string,
  NonNullable<ModelCapabilities['language']>
> = {
  'meta-llama/Llama-3.1-8B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Llama-3.1-70B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Llama-3.3-70B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'deepseek-ai/DeepSeek-V3.1': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'deepseek-ai/DeepSeek-V3-0324': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'deepseek-ai/DeepSeek-R1': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'Qwen/Qwen3-32B': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'Qwen/Qwen3-Coder-480B-A35B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'Qwen/Qwen2.5-VL-7B-Instruct': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'google/gemma-3-27b-it': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'moonshotai/Kimi-K2-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
};
const unknownLanguageCapabilities: NonNullable<ModelCapabilities['language']> =
  {
    inputs: { image: 'unknown', audio: 'unknown' },
    objectGeneration: 'unknown',
    tools: { usage: 'unknown', streaming: 'unknown' },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  };
export function getHuggingFaceLanguageModelEntry(modelId: string) {
  return {
    capabilities: {
      language:
        documentedLanguageCapabilities[modelId] ?? unknownLanguageCapabilities,
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(huggingFaceProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const huggingFaceModelCatalog = Object.fromEntries(
  languageModelIds.map(id => [id, getHuggingFaceLanguageModelEntry(id)]),
);
