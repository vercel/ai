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
import type { TogetherAIImageModelOptions } from './togetherai-image-model-options';
import type { TogetherAIRerankingModelOptions } from './reranking/togetherai-reranking-model-options';
const imageEditingDetails: Partial<
  Record<string, { editingDescription: string }>
> = {
  'black-forest-labs/FLUX.1-kontext-pro': {
    editingDescription: 'Production quality, balanced speed',
  },
  'black-forest-labs/FLUX.1-kontext-max': {
    editingDescription: 'Maximum image fidelity',
  },
  'black-forest-labs/FLUX.1-kontext-dev': {
    editingDescription: 'Development and experimentation',
  },
  'black-forest-labs/FLUX.2-pro': {
    editingDescription: 'High fidelity single-image editing',
  },
  'black-forest-labs/FLUX.2-flex': {
    editingDescription:
      'Single-image editing with adjustable steps and guidance',
  },
};
const embeddingContextDetails: Partial<Record<string, { maxTokens: number }>> =
  {
    'BAAI/bge-large-en-v1.5': { maxTokens: 512 },
    'Alibaba-NLP/gte-modernbert-base': { maxTokens: 8192 },
    'intfloat/multilingual-e5-large-instruct': { maxTokens: 514 },
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
export const togetherAIProviderOptions = {
  embedding: compatibleembeddingProviderOptions,
  language: compatiblelanguageProviderOptions,
  image: {
    steps: {
      description:
        'Number of generation steps. Higher values can improve quality.',
    },
    guidance: { description: 'Guidance scale for image generation.' },
    negative_prompt: { description: 'Negative prompt to guide what to avoid.' },
    disable_safety_checker: {
      description:
        'Disable the safety checker for image generation. When true, the API will not reject images flagged as potentially NSFW. Not available for Flux Schnell Free and Flux Pro models.',
    },
  } satisfies Record<
    keyof TogetherAIImageModelOptions,
    ProviderOptionDefinition
  >,
  reranking: {
    rankFields: {
      description:
        'List of keys in the JSON Object document to rank by. Defaults to use all supplied keys for ranking.',
    },
  } satisfies Record<
    keyof TogetherAIRerankingModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3-8B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3-70B-Instruct-Turbo',
  'meta-llama/Llama-3.2-3B-Instruct-Turbo',
  'meta-llama/Meta-Llama-3-8B-Instruct-Lite',
  'meta-llama/Meta-Llama-3-70B-Instruct-Lite',
  'meta-llama/Llama-3-8b-chat-hf',
  'meta-llama/Llama-3-70b-chat-hf',
  'nvidia/Llama-3.1-Nemotron-70B-Instruct-HF',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'Qwen/QwQ-32B-Preview',
  'microsoft/WizardLM-2-8x22B',
  'google/gemma-2-27b-it',
  'google/gemma-2-9b-it',
  'databricks/dbrx-instruct',
  'deepseek-ai/deepseek-llm-67b-chat',
  'deepseek-ai/DeepSeek-V3',
  'deepseek-ai/DeepSeek-V4-Flash-0731',
  'google/gemma-2b-it',
  'Gryphe/MythoMax-L2-13b',
  'meta-llama/Llama-2-13b-chat-hf',
  'mistralai/Mistral-7B-Instruct-v0.1',
  'mistralai/Mistral-7B-Instruct-v0.2',
  'mistralai/Mistral-7B-Instruct-v0.3',
  'mistralai/Mixtral-8x7B-Instruct-v0.1',
  'mistralai/Mixtral-8x22B-Instruct-v0.1',
  'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO',
  'Qwen/Qwen2.5-7B-Instruct-Turbo',
  'Qwen/Qwen2.5-72B-Instruct-Turbo',
  'Qwen/Qwen2-72B-Instruct',
  'upstage/SOLAR-10.7B-Instruct-v1.0',
  'meta-llama/Llama-2-70b-hf',
  'mistralai/Mistral-7B-v0.1',
  'mistralai/Mixtral-8x7B-v0.1',
  'Meta-Llama/Llama-Guard-7b',
  'codellama/CodeLlama-34b-Instruct-hf',
] as const;
const embeddingModelIds = [
  'togethercomputer/m2-bert-80M-2k-retrieval',
  'togethercomputer/m2-bert-80M-32k-retrieval',
  'togethercomputer/m2-bert-80M-8k-retrieval',
  'WhereIsAI/UAE-Large-V1',
  'BAAI/bge-large-en-v1.5',
  'BAAI/bge-base-en-v1.5',
  'sentence-transformers/msmarco-bert-base-dot-v5',
  'bert-base-uncased',
] as const;
const imageModelIds = [
  'stabilityai/stable-diffusion-xl-base-1.0',
  'black-forest-labs/FLUX.1-dev',
  'black-forest-labs/FLUX.1-dev-lora',
  'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/FLUX.1-canny',
  'black-forest-labs/FLUX.1-depth',
  'black-forest-labs/FLUX.1-redux',
  'black-forest-labs/FLUX.1.1-pro',
  'black-forest-labs/FLUX.1-pro',
  'black-forest-labs/FLUX.1-schnell-Free',
  'black-forest-labs/FLUX.1-kontext-pro',
  'black-forest-labs/FLUX.1-kontext-max',
  'black-forest-labs/FLUX.1-kontext-dev',
] as const;
const rerankingModelIds = [
  'Salesforce/Llama-Rank-v1',
  'mixedbread-ai/Mxbai-Rerank-Large-V2',
] as const;
const documentedLanguageCapabilities: Record<
  string,
  NonNullable<ModelCapabilities['language']>
> = {
  'moonshotai/Kimi-K2.5': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'Qwen/Qwen3.5-397B-A17B': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'MiniMaxAI/MiniMax-M2.5': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'zai-org/GLM-5': {
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
  'openai/gpt-oss-120b': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'openai/gpt-oss-20b': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': {
    inputs: { image: true, audio: 'unknown' },
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
const imageDefinitions: Partial<Record<string, { fileInput: boolean }>> = {
  'black-forest-labs/FLUX.1-kontext-pro': { fileInput: true },
  'black-forest-labs/FLUX.1-kontext-max': { fileInput: true },
  'black-forest-labs/FLUX.1-kontext-dev': { fileInput: true },
  'black-forest-labs/FLUX.1-canny': { fileInput: true },
  'black-forest-labs/FLUX.1-depth': { fileInput: true },
  'black-forest-labs/FLUX.1-redux': { fileInput: true },
  'black-forest-labs/FLUX.2-pro': { fileInput: true },
  'black-forest-labs/FLUX.2-flex': { fileInput: true },
  'stabilityai/stable-diffusion-xl-base-1.0': { fileInput: false },
  'black-forest-labs/FLUX.1-dev': { fileInput: false },
  'black-forest-labs/FLUX.1-dev-lora': { fileInput: false },
  'black-forest-labs/FLUX.1-schnell': { fileInput: false },
  'black-forest-labs/FLUX.1.1-pro': { fileInput: false },
  'black-forest-labs/FLUX.1-pro': { fileInput: false },
  'black-forest-labs/FLUX.1-schnell-Free': { fileInput: false },
  'black-forest-labs/FLUX.2-dev': { fileInput: false },
  'google/gemini-3-pro-image': { fileInput: false },
};
export function getTogetherAILanguageModelEntry(modelId: string) {
  const entry = {
    capabilities: {
      language: {
        ...(documentedLanguageCapabilities[modelId] ??
          unknownLanguageCapabilities),
        structuredOutput: {
          jsonSchema: modelId === 'deepseek-ai/DeepSeek-V4-Flash-0731',
        },
      },
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(togetherAIProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } as const;
  return entry satisfies ModelEntry;
}
export function getTogetherAIImageModelEntry(modelId: string) {
  const fileInput = imageDefinitions[modelId]?.fileInput ?? 'unknown';
  const diffusion = modelId !== 'google/gemini-3-pro-image';
  const entry = {
    capabilities: {
      image: {
        sizes: {
          description:
            'Explicit width and height; accepted dimensions depend on the model.',
        },
        fileInput,
        maskInput: fileInput === 'unknown' ? 'unknown' : false,
        maxImagesPerCall: 1,
        diffusion,
        ...imageEditingDetails[modelId],
      },
    },
    providerOptions: {
      image: Object.fromEntries(
        Object.keys(togetherAIProviderOptions.image).map(key => [
          key,
          diffusion,
        ]),
      ),
    },
  } as const;
  return entry satisfies ModelEntry;
}
const embeddingDimensions: Partial<Record<string, number>> = {
  'BAAI/bge-large-en-v1.5': 1024,
  'Alibaba-NLP/gte-modernbert-base': 768,
  'intfloat/multilingual-e5-large-instruct': 1024,
};
export function getTogetherAIEmbeddingModelEntry(modelId: string) {
  const dimensions = embeddingDimensions[modelId];
  return {
    capabilities: {
      ...(dimensions != null
        ? {
            embedding: {
              defaultDimensions: dimensions,
              customDimensions: 'unknown' as const,
              ...embeddingContextDetails[modelId],
            },
          }
        : {}),
    },
    providerOptions: {
      embedding: Object.fromEntries(
        Object.keys(togetherAIProviderOptions.embedding).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export function getTogetherAIRerankingModelEntry(_modelId: string) {
  return {
    capabilities: {
      reranking: { documents: { text: true, object: true }, topN: true },
    },
    providerOptions: {
      reranking: Object.fromEntries(
        Object.keys(togetherAIProviderOptions.reranking).map(key => [
          key,
          true,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const togetheraiModelCatalog = Object.fromEntries([
  ...languageModelIds.map(
    id => [id, getTogetherAILanguageModelEntry(id)] as const,
  ),
  ...imageModelIds.map(id => [id, getTogetherAIImageModelEntry(id)] as const),
  ...embeddingModelIds.map(
    id => [id, getTogetherAIEmbeddingModelEntry(id)] as const,
  ),
  ...rerankingModelIds.map(
    id => [id, getTogetherAIRerankingModelEntry(id)] as const,
  ),
]);

// Include documented editing IDs in the inventory even when they are accepted
// through the open string type rather than listed in the model-ID union.
Object.assign(
  togetheraiModelCatalog,
  Object.fromEntries(
    Object.keys(imageDefinitions).map(id => [
      id,
      getTogetherAIImageModelEntry(id),
    ]),
  ),
);
