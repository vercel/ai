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
import type { DeepInfraImageModelOptions } from './deepinfra-image-model-options';
const imageDetails: Partial<
  Record<string, { dimensionSpecification: string; notes: string }>
> = {
  'stabilityai/sd3.5': {
    dimensionSpecification: 'Aspect Ratio',
    notes: 'Premium quality base model, 8B parameters',
  },
  'black-forest-labs/FLUX-1.1-pro': {
    dimensionSpecification: 'Size',
    notes: 'Latest state-of-art model with superior prompt following',
  },
  'black-forest-labs/FLUX-1-schnell': {
    dimensionSpecification: 'Size',
    notes: 'Fast generation in 1-4 steps',
  },
  'black-forest-labs/FLUX-1-dev': {
    dimensionSpecification: 'Size',
    notes: 'Optimized for anatomical accuracy',
  },
  'black-forest-labs/FLUX-pro': {
    dimensionSpecification: 'Size',
    notes: 'Flagship Flux model',
  },
  'black-forest-labs/FLUX.1-Kontext-dev': {
    dimensionSpecification: 'Size',
    notes: 'Image editing and transformation model',
  },
  'black-forest-labs/FLUX.1-Kontext-pro': {
    dimensionSpecification: 'Size',
    notes: 'Professional image editing and transformation',
  },
  'stabilityai/sd3.5-medium': {
    dimensionSpecification: 'Aspect Ratio',
    notes: 'Balanced 2.5B parameter model',
  },
  'stabilityai/sdxl-turbo': {
    dimensionSpecification: 'Aspect Ratio',
    notes: 'Optimized for fast generation',
  },
};
const embeddingTokenLimits: Partial<Record<string, number>> = {
  'BAAI/bge-base-en-v1.5': 512,
  'BAAI/bge-large-en-v1.5': 512,
  'BAAI/bge-m3': 8192,
  'intfloat/e5-base-v2': 512,
  'intfloat/e5-large-v2': 512,
  'intfloat/multilingual-e5-large': 512,
  'sentence-transformers/all-MiniLM-L12-v2': 256,
  'sentence-transformers/all-MiniLM-L6-v2': 256,
  'sentence-transformers/all-mpnet-base-v2': 384,
  'sentence-transformers/clip-ViT-B-32': 77,
  'sentence-transformers/clip-ViT-B-32-multilingual-v1': 77,
  'sentence-transformers/multi-qa-mpnet-base-dot-v1': 512,
  'sentence-transformers/paraphrase-MiniLM-L6-v2': 128,
  'shibing624/text2vec-base-chinese': 512,
  'thenlper/gte-base': 512,
  'thenlper/gte-large': 512,
};

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
export const deepInfraProviderOptions = {
  embedding: compatibleembeddingProviderOptions,
  language: compatiblelanguageProviderOptions,
  image: {
    negative_prompt: { description: 'negative_prompt' },
    num_inference_steps: { description: 'num_inference_steps' },
    guidance_scale: { description: 'guidance_scale' },
    guidance: { description: 'guidance' },
    response_format: { description: 'response_format' },
    quality: { description: 'quality' },
    style: { description: 'style' },
    user: { description: 'user' },
  } satisfies Record<
    keyof DeepInfraImageModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  '01-ai/Yi-34B-Chat',
  'Austism/chronos-hermes-13b-v2',
  'bigcode/starcoder2-15b-instruct-v0.1',
  'bigcode/starcoder2-15b',
  'codellama/CodeLlama-34b-Instruct-hf',
  'codellama/CodeLlama-70b-Instruct-hf',
  'cognitivecomputations/dolphin-2.6-mixtral-8x7b',
  'cognitivecomputations/dolphin-2.9.1-llama-3-70b',
  'databricks/dbrx-instruct',
  'deepinfra/airoboros-70b',
  'deepseek-ai/DeepSeek-V3',
  'deepseek-ai/DeepSeek-R1',
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
  'deepseek-ai/DeepSeek-R1-Turbo',
  'google/codegemma-7b-it',
  'google/gemma-1.1-7b-it',
  'google/gemma-2-27b-it',
  'google/gemma-2-9b-it',
  'Gryphe/MythoMax-L2-13b-turbo',
  'Gryphe/MythoMax-L2-13b',
  'HuggingFaceH4/zephyr-orpo-141b-A35b-v0.1',
  'KoboldAI/LLaMA2-13B-Tiefighter',
  'lizpreciatior/lzlv_70b_fp16_hf',
  'mattshumer/Reflection-Llama-3.1-70B',
  'meta-llama/Llama-2-13b-chat-hf',
  'meta-llama/Llama-2-70b-chat-hf',
  'meta-llama/Llama-2-7b-chat-hf',
  'meta-llama/Llama-3.2-11B-Vision-Instruct',
  'meta-llama/Llama-3.2-1B-Instruct',
  'meta-llama/Llama-3.2-3B-Instruct',
  'meta-llama/Llama-3.2-90B-Vision-Instruct',
  'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  'meta-llama/Llama-3.3-70B-Instruct',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  'meta-llama/Meta-Llama-3-70B-Instruct',
  'meta-llama/Meta-Llama-3-8B-Instruct',
  'meta-llama/Meta-Llama-3.1-405B-Instruct',
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-70B-Instruct',
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-8B-Instruct',
  'microsoft/Phi-3-medium-4k-instruct',
  'microsoft/WizardLM-2-7B',
  'microsoft/WizardLM-2-8x22B',
  'mistralai/Mistral-7B-Instruct-v0.1',
  'mistralai/Mistral-7B-Instruct-v0.2',
  'mistralai/Mistral-7B-Instruct-v0.3',
  'mistralai/Mistral-Nemo-Instruct-2407',
  'mistralai/Mixtral-8x22B-Instruct-v0.1',
  'mistralai/Mixtral-8x22B-v0.1',
  'mistralai/Mixtral-8x7B-Instruct-v0.1',
  'NousResearch/Hermes-3-Llama-3.1-405B',
  'nvidia/Llama-3.1-Nemotron-70B-Instruct',
  'nvidia/Nemotron-4-340B-Instruct',
  'openbmb/MiniCPM-Llama3-V-2_5',
  'openchat/openchat_3.5',
  'openchat/openchat-3.6-8b',
  'Phind/Phind-CodeLlama-34B-v2',
  'Qwen/Qwen2-72B-Instruct',
  'Qwen/Qwen2-7B-Instruct',
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'Qwen/Qwen2.5-Coder-7B',
  'Qwen/QwQ-32B-Preview',
  'Sao10K/L3-70B-Euryale-v2.1',
  'Sao10K/L3-8B-Lunaris-v1',
  'Sao10K/L3.1-70B-Euryale-v2.2',
] as const;
const embeddingModelIds = [
  'BAAI/bge-base-en-v1.5',
  'BAAI/bge-large-en-v1.5',
  'BAAI/bge-m3',
  'intfloat/e5-base-v2',
  'intfloat/e5-large-v2',
  'intfloat/multilingual-e5-large',
  'sentence-transformers/all-MiniLM-L12-v2',
  'sentence-transformers/all-MiniLM-L6-v2',
  'sentence-transformers/all-mpnet-base-v2',
  'sentence-transformers/clip-ViT-B-32',
  'sentence-transformers/clip-ViT-B-32-multilingual-v1',
  'sentence-transformers/multi-qa-mpnet-base-dot-v1',
  'sentence-transformers/paraphrase-MiniLM-L6-v2',
  'shibing624/text2vec-base-chinese',
  'thenlper/gte-base',
  'thenlper/gte-large',
] as const;
const imageModelIds = [
  'stabilityai/sd3.5',
  'black-forest-labs/FLUX-1.1-pro',
  'black-forest-labs/FLUX-1-schnell',
  'black-forest-labs/FLUX-1-dev',
  'black-forest-labs/FLUX-pro',
  'black-forest-labs/FLUX.1-Kontext-dev',
  'black-forest-labs/FLUX.1-Kontext-pro',
  'stabilityai/sd3.5-medium',
  'stabilityai/sdxl-turbo',
] as const;
const documentedLanguageCapabilities: Record<
  string,
  NonNullable<ModelCapabilities['language']>
> = {
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: false,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Llama-4-Scout-17B-16E-Instruct': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: false,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': {
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
  'meta-llama/Meta-Llama-3.1-405B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Meta-Llama-3.1-70B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Meta-Llama-3.1-8B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Llama-3.2-11B-Vision-Instruct': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Llama-3.2-90B-Vision-Instruct': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'mistralai/Mixtral-8x7B-Instruct-v0.1': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'deepseek-ai/DeepSeek-V3': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'deepseek-ai/DeepSeek-R1': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: false,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: false,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'deepseek-ai/DeepSeek-R1-Turbo': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: false,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'nvidia/Llama-3.1-Nemotron-70B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'Qwen/Qwen2-7B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'Qwen/Qwen2.5-72B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'Qwen/Qwen2.5-Coder-32B-Instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'Qwen/QwQ-32B-Preview': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'google/codegemma-7b-it': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: false,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'google/gemma-2-9b-it': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: false,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'microsoft/WizardLM-2-8x22B': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: false,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
} satisfies Partial<
  Record<
    (typeof languageModelIds)[number],
    NonNullable<ModelCapabilities['language']>
  >
>;
const unknownLanguageCapabilities: NonNullable<ModelCapabilities['language']> =
  {
    inputs: { image: 'unknown', audio: 'unknown' },
    objectGeneration: 'unknown',
    tools: { usage: 'unknown', streaming: 'unknown' },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  };
export function getDeepInfraLanguageModelEntry(modelId: string) {
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
        Object.keys(deepInfraProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } as const;
  return entry satisfies ModelEntry;
}
const imageFileInputSupport: Partial<Record<string, boolean>> = {
  'stabilityai/sd3.5': true,
  'black-forest-labs/FLUX-1.1-pro': true,
  'black-forest-labs/FLUX-1-schnell': true,
  'black-forest-labs/FLUX-1-dev': true,
  'black-forest-labs/FLUX-pro': true,
  'black-forest-labs/FLUX.1-Kontext-dev': true,
  'black-forest-labs/FLUX.1-Kontext-pro': true,
  'Qwen/Qwen-Image-Edit': true,
  'stabilityai/sd3.5-medium': true,
  'stabilityai/sdxl-turbo': true,
};
export function getDeepInfraImageModelEntry(modelId: string) {
  const fileInput = imageFileInputSupport[modelId] ?? 'unknown';
  return {
    capabilities: {
      image: {
        sizes: {
          description:
            'Explicit size or aspect ratio; accepted dimensions depend on the model.',
        },
        fileInput,
        maskInput: fileInput,
        maxImagesPerCall: 1,
        ...imageDetails[modelId],
      },
    },
    providerOptions: {
      image: Object.fromEntries(
        Object.keys(deepInfraProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
const embeddingDimensions: Partial<Record<string, number>> = {
  'BAAI/bge-base-en-v1.5': 768,
  'BAAI/bge-large-en-v1.5': 1024,
  'BAAI/bge-m3': 1024,
  'intfloat/e5-base-v2': 768,
  'intfloat/e5-large-v2': 1024,
  'intfloat/multilingual-e5-large': 1024,
  'sentence-transformers/all-MiniLM-L12-v2': 384,
  'sentence-transformers/all-MiniLM-L6-v2': 384,
  'sentence-transformers/all-mpnet-base-v2': 768,
  'sentence-transformers/clip-ViT-B-32': 512,
  'sentence-transformers/clip-ViT-B-32-multilingual-v1': 512,
  'sentence-transformers/multi-qa-mpnet-base-dot-v1': 768,
  'sentence-transformers/paraphrase-MiniLM-L6-v2': 384,
  'shibing624/text2vec-base-chinese': 768,
  'thenlper/gte-base': 768,
  'thenlper/gte-large': 1024,
};
export function getDeepInfraEmbeddingModelEntry(modelId: string) {
  const dimensions = embeddingDimensions[modelId];
  return {
    capabilities: {
      ...(dimensions != null
        ? {
            embedding: {
              defaultDimensions: dimensions,
              ...{ maxTokens: embeddingTokenLimits[modelId] },
              customDimensions: 'unknown' as const,
            },
          }
        : {}),
    },
    providerOptions: {
      embedding: Object.fromEntries(
        Object.keys(deepInfraProviderOptions.embedding).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const deepInfraModelCatalog = Object.fromEntries([
  ...languageModelIds.map(
    id => [id, getDeepInfraLanguageModelEntry(id)] as const,
  ),
  ...imageModelIds.map(id => [id, getDeepInfraImageModelEntry(id)] as const),
  ...embeddingModelIds.map(
    id => [id, getDeepInfraEmbeddingModelEntry(id)] as const,
  ),
]);

// This editing model is also recognized by the adapter's file-input policy.
deepInfraModelCatalog['Qwen/Qwen-Image-Edit'] = getDeepInfraImageModelEntry(
  'Qwen/Qwen-Image-Edit',
);
