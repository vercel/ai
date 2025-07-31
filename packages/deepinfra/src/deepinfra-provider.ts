import {
  LanguageModelV2,
  EmbeddingModelV2,
  ProviderV2,
  ImageModelV2,
} from '@ai-sdk/provider';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { DeepInfraChatModelId } from './deepinfra-chat-options';
import { DeepInfraEmbeddingModelId } from './deepinfra-embedding-options';
import { DeepInfraCompletionModelId } from './deepinfra-completion-options';
import { DeepInfraImageModelId } from './deepinfra-image-settings';
import { DeepInfraImageModel } from './deepinfra-image-model';

export interface DeepInfraProviderSettings {
  /**
DeepInfra API key.
*/
  apiKey?: string;
  /**
Base URL for the API calls.
*/
  baseURL?: string;
  /**
Custom headers to include in the requests.
*/
  headers?: Record<string, string>;
  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
*/
  fetch?: FetchFunction;
}

export interface DeepInfraProvider extends ProviderV2 {
  /**
Creates a model for text generation.
*/
  (modelId: DeepInfraChatModelId): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  chatModel(modelId: DeepInfraChatModelId): LanguageModelV2;

  /**
Creates a model for image generation.
  */
  image(modelId: DeepInfraImageModelId): ImageModelV2;

  /**
Creates a model for image generation.
  */
  imageModel(modelId: DeepInfraImageModelId): ImageModelV2;

  /**
Creates a chat model for text generation.
*/
  languageModel(modelId: DeepInfraChatModelId): LanguageModelV2;

  /**
Creates a completion model for text generation.
*/
  completionModel(modelId: DeepInfraCompletionModelId): LanguageModelV2;

  /**
Creates a text embedding model for text generation.
*/
  textEmbeddingModel(
    modelId: DeepInfraEmbeddingModelId,
  ): EmbeddingModelV2<string>;
}

export function createDeepInfra(
  options: DeepInfraProviderSettings = {},
): DeepInfraProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.deepinfra.com/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'DEEPINFRA_API_KEY',
      description: "DeepInfra's API key",
    })}`,
    ...options.headers,
  });

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `deepinfra.${modelType}`,
    url: ({ path }) => `${baseURL}/openai${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (modelId: DeepInfraChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(
      modelId,
      getCommonModelConfig('chat'),
    );
  };

  const createCompletionModel = (modelId: DeepInfraCompletionModelId) =>
    new OpenAICompatibleCompletionLanguageModel(
      modelId,
      getCommonModelConfig('completion'),
    );

  const createTextEmbeddingModel = (modelId: DeepInfraEmbeddingModelId) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      getCommonModelConfig('embedding'),
    );

  const createImageModel = (modelId: DeepInfraImageModelId) =>
    new DeepInfraImageModel(modelId, {
      ...getCommonModelConfig('image'),
      baseURL: baseURL
        ? `${baseURL}/inference`
        : 'https://api.deepinfra.com/v1/inference',
    });

  const provider = (modelId: DeepInfraChatModelId) => createChatModel(modelId);

  provider.completionModel = createCompletionModel;
  provider.chatModel = createChatModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  return provider;
}

export const deepinfra = createDeepInfra();
