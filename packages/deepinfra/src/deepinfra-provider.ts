import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
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
import {
  DeepInfraChatModelId,
  DeepInfraChatSettings,
} from './deepinfra-chat-settings';
import {
  DeepInfraEmbeddingModelId,
  DeepInfraEmbeddingSettings,
} from './deepinfra-embedding-settings';
import {
  DeepInfraCompletionModelId,
  DeepInfraCompletionSettings,
} from './deepinfra-completion-settings';

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

export interface DeepInfraProvider {
  /**
Creates a model for text generation.
*/
  (
    modelId: DeepInfraChatModelId,
    settings?: DeepInfraChatSettings,
  ): LanguageModelV1;

  /**
Creates a chat model for text generation.
*/
  chatModel(
    modelId: DeepInfraChatModelId,
    settings?: DeepInfraChatSettings,
  ): LanguageModelV1;

  /**
Creates a completion model for text generation.
*/
  completionModel(
    modelId: DeepInfraCompletionModelId,
    settings?: DeepInfraCompletionSettings,
  ): LanguageModelV1;

  /**
Creates a text embedding model for text generation.
*/
  textEmbeddingModel(
    modelId: DeepInfraEmbeddingModelId,
    settings?: DeepInfraEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

export function createDeepInfra(
  options: DeepInfraProviderSettings = {},
): DeepInfraProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.deepinfra.com/v1/openai',
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
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (
    modelId: DeepInfraChatModelId,
    settings: DeepInfraChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...getCommonModelConfig('chat'),
      defaultObjectGenerationMode: 'json',
    });
  };

  const createCompletionModel = (
    modelId: DeepInfraCompletionModelId,
    settings: DeepInfraCompletionSettings = {},
  ) =>
    new OpenAICompatibleCompletionLanguageModel(
      modelId,
      settings,
      getCommonModelConfig('completion'),
    );

  const createTextEmbeddingModel = (
    modelId: DeepInfraEmbeddingModelId,
    settings: DeepInfraEmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      settings,
      getCommonModelConfig('embedding'),
    );

  const provider = (
    modelId: DeepInfraChatModelId,
    settings?: DeepInfraChatSettings,
  ) => createChatModel(modelId, settings);

  provider.completionModel = createCompletionModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  return provider as DeepInfraProvider;
}

export const deepinfra = createDeepInfra();
