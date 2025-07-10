import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import {
  EmbeddingModelV2,
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { BasetenChatModelId } from './baseten-chat-options';
import { BasetenEmbeddingModelId } from './baseten-embedding-options';

export type BasetenErrorData = z.infer<typeof basetenErrorSchema>;

const basetenErrorSchema = z.object({
  error: z.string(),
});

const basetenErrorStructure: ProviderErrorStructure<BasetenErrorData> = {
  errorSchema: basetenErrorSchema,
  errorToMessage: data => data.error,
};

export interface BasetenProviderSettings {
  /**
   * Baseten API key. Default value is taken from the `BASETEN_API_KEY`
   * environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the Model APIs. Default: 'https://inference.baseten.co/v1'
   */
  baseURL?: string;

  /**
   * Model URL for custom models (chat or embeddings).
   * If not supplied, the default Model APIs will be used.
   */
  modelURL?: string;
  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface BasetenProvider extends ProviderV2 {
  /**
Creates a chat model for text generation. 
*/
  (modelId?: BasetenChatModelId): LanguageModelV2;

  /**
Creates a chat model for text generation. 
*/
  chatModel(modelId?: BasetenChatModelId): LanguageModelV2;

  /**
Creates a language model for text generation. Alias for chatModel.
*/
  languageModel(modelId?: BasetenChatModelId): LanguageModelV2;

  /**
Creates a text embedding model for text generation.
*/
  textEmbeddingModel(
    modelId?: BasetenEmbeddingModelId,
  ): EmbeddingModelV2<string>;
}

// by default, we use the Model APIs
const defaultBaseURL = 'https://inference.baseten.co/v1';

export function createBaseten(
  options: BasetenProviderSettings = {},
): BasetenProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = (isPredict = false) => ({
    Authorization: isPredict
      ? `Api-Key ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'BASETEN_API_KEY',
          description: 'Baseten API key',
        })}`
      : `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'BASETEN_API_KEY',
          description: 'Baseten API key',
        })}`,
    ...options.headers,
  });

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (
    modelType: string,
    customURL?: string,
  ): CommonModelConfig => ({
    provider: `baseten.${modelType}`,
    url: ({ path }) => `${customURL || baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (modelId?: BasetenChatModelId) => {
    // Use modelURL if provided, otherwise use default Model APIs
    const customURL = options.modelURL;

    if (customURL) {
      // Check if this is a /sync/v1 endpoint (OpenAI-compatible) or /predict endpoint (custom)
      const isOpenAICompatible = customURL.includes('/sync/v1');

      if (isOpenAICompatible) {
        // For /sync/v1 endpoints, use standard OpenAI-compatible format
        return new OpenAICompatibleChatLanguageModel(modelId ?? 'placeholder', {
          ...getCommonModelConfig('chat', customURL),
          errorStructure: basetenErrorStructure,
        });
      } else if (customURL.includes('/predict')) {
        throw new Error(
          'Not supported. You must use a /sync/v1 endpoint for chat models.',
        );
      }
    }

    // Use default OpenAI-compatible format for Model APIs
    return new OpenAICompatibleChatLanguageModel(modelId ?? 'chat', {
      ...getCommonModelConfig('chat'),
      errorStructure: basetenErrorStructure,
    });
  };

  const createTextEmbeddingModel = (modelId?: BasetenEmbeddingModelId) => {
    // Use modelURL if provided
    const customURL = options.modelURL;
    if (!customURL) {
      throw new Error(
        'No model URL provided for embeddings. Please set modelURL option for embeddings.',
      );
    }

    // Check if this is a /sync/v1 endpoint (OpenAI-compatible) or /predict endpoint (custom)
    const isOpenAICompatible = customURL.includes('/sync/v1');

    if (isOpenAICompatible) {
      // For /sync/v1 endpoints, use standard OpenAI-compatible format
      return new OpenAICompatibleEmbeddingModel(modelId ?? 'embeddings', {
        ...getCommonModelConfig('embedding', customURL),
        errorStructure: basetenErrorStructure,
      });
    } else {
      // For /predict endpoints, use custom format
      const model = new OpenAICompatibleEmbeddingModel(
        modelId ?? 'embeddings',
        {
          provider: 'baseten.embedding',
          url: ({ path }) => {
            // For custom model URLs, don't append the path - use the URL as-is
            return customURL;
          },
          headers: getHeaders,
          fetch: options.fetch,
          errorStructure: basetenErrorStructure,
        },
      );

      // Override the doEmbed method to transform the request format
      const originalDoEmbed = model.doEmbed.bind(model);
      model.doEmbed = async params => {
        // Transform the parameters to Baseten's /predict format
        const transformedParams = { ...params };

        // For embeddings, Baseten expects the text as 'input'
        if (params.values && Array.isArray(params.values)) {
          const input = params.values.join('\n');
          (transformedParams as any).input = input;
        }

        return originalDoEmbed(transformedParams);
      };

      return model;
    }
  };

  const provider = (modelId?: BasetenChatModelId) => createChatModel(modelId);
  provider.chatModel = createChatModel;
  provider.languageModel = createChatModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  provider.textEmbeddingModel = createTextEmbeddingModel;
  return provider;
}

export const baseten = createBaseten();
