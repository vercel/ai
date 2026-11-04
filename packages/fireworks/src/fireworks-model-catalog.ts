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
import type { FireworksLanguageModelOptions } from './fireworks-chat-options';
import type { FireworksEmbeddingModelOptions } from './fireworks-embedding-options';
import type { FireworksImageModelOptions } from './fireworks-image-model-options';
import type { FireworksImageModelId } from './fireworks-image-options';
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
export const fireworksProviderOptions = {
  language: {
    ...compatiblelanguageProviderOptions,
    promptCacheKey: {
      description:
        'A stable key for routing requests with shared prompt prefixes to the same prompt cache.',
    },
    serviceTier: {
      description:
        'Use Fireworks Priority serving path for higher reliability during peak traffic.',
    },
    thinking: { description: 'thinking' },
    reasoningHistory: { description: 'reasoningHistory' },
  } satisfies Record<
    keyof FireworksLanguageModelOptions,
    ProviderOptionDefinition
  >,
  embedding: {
    ...compatibleembeddingProviderOptions,
  } satisfies Record<
    keyof FireworksEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  image: {
    guidance_scale: {
      description:
        'Classifier-free guidance scale for the image diffusion process.',
    },
    num_inference_steps: {
      description:
        'Number of denoising steps for the image generation process.',
    },
    output_format: { description: 'Desired output image format.' },
    webhook_url: {
      description:
        'URL to receive webhook notifications for async Kontext requests.',
    },
    webhook_secret: {
      description: 'Secret for webhook signature verification.',
    },
    prompt_upsampling: {
      description:
        'Whether Fireworks should automatically modify the prompt for more creative generation.',
    },
    safety_tolerance: {
      description: 'Moderation tolerance level for inputs and outputs.',
    },
    cfg_scale: {
      description: 'Guidance scale for legacy image_generation models.',
    },
    steps: {
      description:
        'Number of generation steps for legacy image_generation models.',
    },
  } satisfies Record<
    keyof FireworksImageModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  'accounts/fireworks/models/deepseek-v3',
  'accounts/fireworks/models/llama-v3p3-70b-instruct',
  'accounts/fireworks/models/llama-v3p2-3b-instruct',
  'accounts/fireworks/models/llama-v3p1-405b-instruct',
  'accounts/fireworks/models/llama-v3p1-8b-instruct',
  'accounts/fireworks/models/mixtral-8x7b-instruct',
  'accounts/fireworks/models/mixtral-8x22b-instruct',
  'accounts/fireworks/models/mixtral-8x7b-instruct-hf',
  'accounts/fireworks/models/qwen2p5-coder-32b-instruct',
  'accounts/fireworks/models/qwen2p5-72b-instruct',
  'accounts/fireworks/models/qwen-qwq-32b-preview',
  'accounts/fireworks/models/qwen2-vl-72b-instruct',
  'accounts/fireworks/models/llama-v3p2-11b-vision-instruct',
  'accounts/fireworks/models/qwq-32b',
  'accounts/fireworks/models/yi-large',
  'accounts/fireworks/models/kimi-k2-instruct',
  'accounts/fireworks/models/kimi-k2-thinking',
  'accounts/fireworks/models/kimi-k2p6',
  'accounts/fireworks/models/minimax-m2',
  'accounts/fireworks/models/llama-v3-8b-instruct',
  'accounts/fireworks/models/llama-v2-34b-code',
] as const;
const embeddingModelIds = ['nomic-ai/nomic-embed-text-v1.5'] as const;
const imageModelIds = [
  'accounts/fireworks/models/flux-1-dev-fp8',
  'accounts/fireworks/models/flux-1-schnell-fp8',
  'accounts/fireworks/models/flux-kontext-pro',
  'accounts/fireworks/models/flux-kontext-max',
  'accounts/fireworks/models/playground-v2-5-1024px-aesthetic',
  'accounts/fireworks/models/japanese-stable-diffusion-xl',
  'accounts/fireworks/models/playground-v2-1024px-aesthetic',
  'accounts/fireworks/models/SSD-1B',
  'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0',
] as const;
const documentedLanguageCapabilities: Record<
  string,
  NonNullable<ModelCapabilities['language']>
> = {
  'accounts/fireworks/models/firefunction-v1': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/deepseek-r1': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/deepseek-v3': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/llama-v3p1-405b-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/llama-v3p1-8b-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/llama-v3p2-3b-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/llama-v3p3-70b-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/mixtral-8x7b-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/mixtral-8x7b-instruct-hf': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/mixtral-8x22b-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/qwen2p5-coder-32b-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/qwen2p5-72b-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/qwen-qwq-32b-preview': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/qwen2-vl-72b-instruct': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/llama-v3p2-11b-vision-instruct': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/qwq-32b': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: false, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/yi-large': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/kimi-k2-instruct': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/kimi-k2-thinking': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/kimi-k2p6': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'accounts/fireworks/models/minimax-m2': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: false },
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

// Model families that always reason and reject reasoning effort 'none'.
const modelsWithoutNoneReasoningEffort = /^(?:gpt-oss|glm-5p3|muse-spark)/;

// Model families that reject reasoning effort 'minimal'.
const modelsWithoutMinimalReasoningEffort = /^(?:nemotron|inkling)/;

/**
 * Fireworks accepts every reasoning effort for most models, so reasoning
 * values are sent directly, except to model families known to reject them.
 */
function getFireworksReasoningEffortMap(modelId: string) {
  const modelName = modelId.slice(modelId.lastIndexOf('/') + 1);

  return {
    ...(!modelsWithoutNoneReasoningEffort.test(modelName) && {
      none: 'none' as const,
    }),
    ...(!modelsWithoutMinimalReasoningEffort.test(modelName) && {
      minimal: 'minimal' as const,
    }),
    low: 'low' as const,
    medium: 'medium' as const,
    high: 'high' as const,
    xhigh: 'xhigh' as const,
    max: 'max' as const,
  };
}

export function getFireworksLanguageModelEntry(modelId: string) {
  const effortMap = getFireworksReasoningEffortMap(modelId);
  const entry = {
    capabilities: {
      language: {
        ...(documentedLanguageCapabilities[modelId] ??
          unknownLanguageCapabilities),
        reasoning: { support: 'unknown', efforts: Object.values(effortMap) },
        structuredOutput: { jsonSchema: true },
      },
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(fireworksProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { language: { reasoningEffortMap: effortMap } },
  } as const;
  return entry satisfies ModelEntry<{
    language: { reasoningEffortMap: typeof effortMap };
  }>;
}
interface FireworksImageModelBackendConfig {
  urlFormat: 'workflows' | 'workflows_async' | 'image_generation';
  supportsSize?: boolean;
  supportsEditing?: boolean;
}

const modelToBackendConfig: Partial<
  Record<FireworksImageModelId, FireworksImageModelBackendConfig>
> = {
  'accounts/fireworks/models/flux-1-dev-fp8': {
    urlFormat: 'workflows',
  },
  'accounts/fireworks/models/flux-1-schnell-fp8': {
    urlFormat: 'workflows',
  },
  'accounts/fireworks/models/flux-kontext-pro': {
    urlFormat: 'workflows_async',
    supportsEditing: true,
  },
  'accounts/fireworks/models/flux-kontext-max': {
    urlFormat: 'workflows_async',
    supportsEditing: true,
  },
  'accounts/fireworks/models/playground-v2-5-1024px-aesthetic': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
  'accounts/fireworks/models/japanese-stable-diffusion-xl': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
  'accounts/fireworks/models/playground-v2-1024px-aesthetic': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
  'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
  'accounts/fireworks/models/SSD-1B': {
    urlFormat: 'image_generation',
    supportsSize: true,
  },
};

export function getFireworksImageModelEntry(modelId: string) {
  const config = modelToBackendConfig[modelId];
  const fileInput =
    config == null ? 'unknown' : config.supportsEditing === true;
  const entry = {
    capabilities: {
      image: {
        sizes: {
          description: config?.supportsSize
            ? 'Explicit width and height.'
            : 'Aspect ratio; explicit sizes are not supported.',
        },
        fileInput,
        maskInput: config == null ? 'unknown' : false,
        maxImagesPerCall: 1,
        size: config?.supportsSize === true,
      },
    },
    providerOptions: {
      image: Object.fromEntries(
        Object.keys(fireworksProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { image: { urlFormat: config?.urlFormat ?? 'workflows' } },
  } as const;
  return entry satisfies ModelEntry<{
    image: { urlFormat: FireworksImageModelBackendConfig['urlFormat'] };
  }>;
}
export function getFireworksEmbeddingModelEntry(modelId: string) {
  return {
    capabilities: {
      ...(modelId === 'nomic-ai/nomic-embed-text-v1.5'
        ? {
            embedding: {
              defaultDimensions: 768,
              ...{ maxTokens: 8192 },
              customDimensions: 'unknown' as const,
            },
          }
        : {}),
    },
    providerOptions: {
      embedding: Object.fromEntries(
        Object.keys(fireworksProviderOptions.embedding).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const fireworksModelCatalog = Object.fromEntries([
  ...languageModelIds.map(
    id => [id, getFireworksLanguageModelEntry(id)] as const,
  ),
  ...imageModelIds.map(id => [id, getFireworksImageModelEntry(id)] as const),
  ...embeddingModelIds.map(
    id => [id, getFireworksEmbeddingModelEntry(id)] as const,
  ),
]);

Object.assign(
  fireworksModelCatalog,
  Object.fromEntries(
    Object.keys(documentedLanguageCapabilities).map(id => [
      id,
      getFireworksLanguageModelEntry(id),
    ]),
  ),
);

export const fireworksStabilityModelCatalog = Object.fromEntries(
  [
    'accounts/stability/models/sd3-turbo',
    'accounts/stability/models/sd3-medium',
    'accounts/stability/models/sd3',
  ].map(id => [id, getFireworksImageModelEntry(id)]),
);
