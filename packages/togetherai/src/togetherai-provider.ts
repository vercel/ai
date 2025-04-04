import {
  LanguageModelV2,
  EmbeddingModelV1,
  ProviderV1,
  ImageModelV1,
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
import {
  TogetherAIChatModelId,
  TogetherAIChatSettings,
} from './togetherai-chat-settings';
import {
  TogetherAIEmbeddingModelId,
  TogetherAIEmbeddingSettings,
} from './togetherai-embedding-settings';
import {
  TogetherAICompletionModelId,
  TogetherAICompletionSettings,
} from './togetherai-completion-settings';
import { TogetherAIImageModel } from './togetherai-image-model';
import {
  TogetherAIImageModelId,
  TogetherAIImageSettings,
} from './togetherai-image-settings';

export interface TogetherAIProviderSettings {
  /**
TogetherAI API key.
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

export interface TogetherAIProvider extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (
    modelId: TogetherAIChatModelId,
    settings?: TogetherAIChatSettings,
  ): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  chatModel(
    modelId: TogetherAIChatModelId,
    settings?: TogetherAIChatSettings,
  ): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  languageModel(
    modelId: TogetherAIChatModelId,
    settings?: TogetherAIChatSettings,
  ): LanguageModelV2;

  /**
Creates a completion model for text generation.
*/
  completionModel(
    modelId: TogetherAICompletionModelId,
    settings?: TogetherAICompletionSettings,
  ): LanguageModelV2;

  /**
Creates a text embedding model for text generation.
*/
  textEmbeddingModel(
    modelId: TogetherAIEmbeddingModelId,
    settings?: TogetherAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  /**
  Creates a model for image generation.
   */
  image(
    modelId: TogetherAIImageModelId,
    settings?: TogetherAIImageSettings,
  ): ImageModelV1;

  /**
  Creates a model for image generation.
   */
  imageModel(
    modelId: TogetherAIImageModelId,
    settings?: TogetherAIImageSettings,
  ): ImageModelV1;
}

export function createTogetherAI(
  options: TogetherAIProviderSettings = {},
): TogetherAIProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.together.xyz/v1/',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'TOGETHER_AI_API_KEY',
      description: 'TogetherAI',
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
    provider: `togetherai.${modelType}`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (
    modelId: TogetherAIChatModelId,
    settings: TogetherAIChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...getCommonModelConfig('chat'),
      defaultObjectGenerationMode: 'tool',
    });
  };

  const createCompletionModel = (
    modelId: TogetherAICompletionModelId,
    settings: TogetherAICompletionSettings = {},
  ) =>
    new OpenAICompatibleCompletionLanguageModel(
      modelId,
      settings,
      getCommonModelConfig('completion'),
    );

  const createTextEmbeddingModel = (
    modelId: TogetherAIEmbeddingModelId,
    settings: TogetherAIEmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      settings,
      getCommonModelConfig('embedding'),
    );

  const createImageModel = (
    modelId: TogetherAIImageModelId,
    settings: TogetherAIImageSettings = {},
  ) =>
    new TogetherAIImageModel(modelId, settings, {
      ...getCommonModelConfig('image'),
      baseURL: baseURL ?? 'https://api.together.xyz/v1/',
    });

  const provider = (
    modelId: TogetherAIChatModelId,
    settings?: TogetherAIChatSettings,
  ) => createChatModel(modelId, settings);

  provider.completionModel = createCompletionModel;
  provider.languageModel = createChatModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;

  return provider;
}

export const togetherai = createTogetherAI();
