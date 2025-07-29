import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
  ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { FireworksChatModelId } from './fireworks-chat-options';
import { FireworksCompletionModelId } from './fireworks-completion-options';
import { FireworksEmbeddingModelId } from './fireworks-embedding-options';
import { FireworksImageModel } from './fireworks-image-model';
import { FireworksImageModelId } from './fireworks-image-options';

export type FireworksErrorData = z.infer<typeof fireworksErrorSchema>;

const fireworksErrorSchema = z.object({
  error: z.string(),
});

const fireworksErrorStructure: ProviderErrorStructure<FireworksErrorData> = {
  errorSchema: fireworksErrorSchema,
  errorToMessage: data => data.error,
};

export interface FireworksProviderSettings {
  /**
Fireworks API key. Default value is taken from the `FIREWORKS_API_KEY`
environment variable.
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

export interface FireworksProvider extends ProviderV2 {
  /**
Creates a model for text generation.
*/
  (modelId: FireworksChatModelId): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  chatModel(modelId: FireworksChatModelId): LanguageModelV2;

  /**
Creates a completion model for text generation.
*/
  completionModel(modelId: FireworksCompletionModelId): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  languageModel(modelId: FireworksChatModelId): LanguageModelV2;

  /**
Creates a text embedding model for text generation.
*/
  textEmbeddingModel(
    modelId: FireworksEmbeddingModelId,
  ): EmbeddingModelV2<string>;

  /**
Creates a model for image generation.
*/
  image(modelId: FireworksImageModelId): ImageModelV2;

  /**
Creates a model for image generation.
*/
  imageModel(modelId: FireworksImageModelId): ImageModelV2;
}

const defaultBaseURL = 'https://api.fireworks.ai/inference/v1';

export function createFireworks(
  options: FireworksProviderSettings = {},
): FireworksProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'FIREWORKS_API_KEY',
      description: 'Fireworks API key',
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
    provider: `fireworks.${modelType}`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (modelId: FireworksChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      ...getCommonModelConfig('chat'),
      errorStructure: fireworksErrorStructure,
    });
  };

  const createCompletionModel = (modelId: FireworksCompletionModelId) =>
    new OpenAICompatibleCompletionLanguageModel(modelId, {
      ...getCommonModelConfig('completion'),
      errorStructure: fireworksErrorStructure,
    });

  const createTextEmbeddingModel = (modelId: FireworksEmbeddingModelId) =>
    new OpenAICompatibleEmbeddingModel(modelId, {
      ...getCommonModelConfig('embedding'),
      errorStructure: fireworksErrorStructure,
    });

  const createImageModel = (modelId: FireworksImageModelId) =>
    new FireworksImageModel(modelId, {
      ...getCommonModelConfig('image'),
      baseURL: baseURL ?? defaultBaseURL,
    });

  const provider = (modelId: FireworksChatModelId) => createChatModel(modelId);

  provider.completionModel = createCompletionModel;
  provider.chatModel = createChatModel;
  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  return provider;
}

export const fireworks = createFireworks();
