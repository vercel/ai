import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { OpenAICompatibleLanguageModelChatOptions } from './chat/openai-compatible-chat-language-model-options';
import type { OpenAICompatibleLanguageModelCompletionOptions } from './completion/openai-compatible-completion-language-model-options';
import type { OpenAICompatibleEmbeddingModelOptions } from './embedding/openai-compatible-embedding-model-options';
import type { OpenAICompatibleImageModelOptions } from './image/openai-compatible-image-model-options';

/** Options are declared by the adapter; support depends on the configured backend. */
export const openaiCompatibleProviderOptions = {
  language: {
    user: {
      description:
        'A unique identifier representing your end-user, which can help providers to monitor and detect abuse.',
    },
    reasoningEffort: {
      description:
        'Reasoning effort for reasoning models. Defaults to `medium`. Set to `null` to send `"reasoning_effort": null`, for providers that treat an explicit `null` differently from an omitted field.',
    },
    textVerbosity: {
      description:
        'Controls the verbosity of the generated text. Defaults to `medium`.',
    },
    strictJsonSchema: {
      description:
        'Whether to use strict JSON schema validation. When true, the model uses constrained decoding to guarantee schema compliance. Only used when the provider supports structured outputs and a schema is provided.',
    },
    echo: {
      description: 'Echo back the prompt in addition to the completion.',
    },
    logitBias: {
      description:
        'Modify the likelihood of specified tokens appearing in the completion. Accepts a JSON object that maps tokens (specified by their token ID in the GPT tokenizer) to an associated bias value from -100 to 100.',
    },
    suffix: {
      description: 'The suffix that comes after a completion of inserted text.',
    },
  } satisfies Record<
    | keyof OpenAICompatibleLanguageModelChatOptions
    | keyof OpenAICompatibleLanguageModelCompletionOptions,
    ProviderOptionDefinition
  >,
  embedding: {
    dimensions: {
      description:
        'The number of dimensions the resulting output embeddings should have. Only supported in text-embedding-3 and later models.',
    },
    user: {
      description:
        'A unique identifier representing your end-user, which can help providers to monitor and detect abuse.',
    },
  } satisfies Record<
    keyof OpenAICompatibleEmbeddingModelOptions,
    ProviderOptionDefinition
  >,
  image: {
    size: {
      description:
        'Dimensions of the generated image. Supported values depend on the provider and model.',
    },
    quality: {
      description:
        'Quality of the generated image. Supported values depend on the provider and model.',
    },
    output_format: {
      description:
        'File format of the generated image. Supported values depend on the provider and model.',
    },
    output_compression: {
      description: 'Compression level for JPEG and WebP images.',
    },
    background: {
      description:
        'Background behavior for the generated image. Supported values depend on the provider and model.',
    },
  } satisfies Record<
    keyof OpenAICompatibleImageModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const openaiCompatibleRequestDefaults = {
  embedding: { maxEmbeddingsPerCall: 2048, supportsParallelCalls: true },
  image: { maxImagesPerCall: 10 },
  language: { supportsStructuredOutputs: false },
} as const;

/**
 * This protocol accepts arbitrary model IDs. Undeclared backend capabilities
 * remain unknown; a protocol name does not identify a hosted model inventory.
 */
export function getOpenAICompatibleModelEntry(_modelId: string) {
  return {
    capabilities: {
      language: {
        inputs: { image: 'unknown', audio: 'unknown' },
        objectGeneration: 'unknown',
        tools: { usage: 'unknown', streaming: 'unknown' },
        reasoning: { support: 'unknown' },
        sampling: {
          temperature: 'unknown',
          topP: 'unknown',
          logprobs: 'unknown',
        },
      },
      image: {
        sizes: { description: 'Depends on the configured backend and model.' },
        fileInput: 'unknown',
        maskInput: 'unknown',
        maxImagesPerCall:
          openaiCompatibleRequestDefaults.image.maxImagesPerCall,
      },
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(openaiCompatibleProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
      embedding: Object.fromEntries(
        Object.keys(openaiCompatibleProviderOptions.embedding).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
      image: Object.fromEntries(
        Object.keys(openaiCompatibleProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: openaiCompatibleRequestDefaults,
  } satisfies ModelEntry<typeof openaiCompatibleRequestDefaults>;
}

/** An arbitrary configured model; this adapter does not own a hosted inventory. */
export const openaiCompatibleModelCatalog = {
  '*': getOpenAICompatibleModelEntry('*'),
};
