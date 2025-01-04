import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
  ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import {
  EmbeddingModelV1,
  ImageModelV1,
  LanguageModelV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import {
  FireworksChatModelId,
  FireworksChatSettings,
} from './fireworks-chat-settings';
import {
  FireworksCompletionModelId,
  FireworksCompletionSettings,
} from './fireworks-completion-settings';
import {
  FireworksEmbeddingModelId,
  FireworksEmbeddingSettings,
} from './fireworks-embedding-settings';
import {
  FireworksImageModel,
  FireworksImageModelId,
} from './fireworks-image-model';
import { FireworksConfig } from './fireworks-config';

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
Fireworks API key.
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

export interface FireworksProvider {
  /**
Creates a model for text generation.
*/
  (
    modelId: FireworksChatModelId,
    settings?: FireworksChatSettings,
  ): LanguageModelV1;

  /**
Creates a chat model for text generation.
*/
  chatModel(
    modelId: FireworksChatModelId,
    settings?: FireworksChatSettings,
  ): LanguageModelV1;

  /**
Creates a completion model for text generation.
*/
  completionModel(
    modelId: FireworksCompletionModelId,
    settings?: FireworksCompletionSettings,
  ): LanguageModelV1;

  /**
Creates a text embedding model for text generation.
*/
  textEmbeddingModel(
    modelId: FireworksEmbeddingModelId,
    settings?: FireworksEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  /**
   * Creates a model for image generation.
   */
  image(modelId: FireworksImageModelId): ImageModelV1;
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

  const createCommonModelConfig = (modelType: string): FireworksConfig => ({
    provider: `fireworks.${modelType}`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (
    modelId: FireworksChatModelId,
    settings: FireworksChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...createCommonModelConfig('chat'),
      errorStructure: fireworksErrorStructure,
      defaultObjectGenerationMode: 'json',
    });
  };

  const createCompletionModel = (
    modelId: FireworksCompletionModelId,
    settings: FireworksCompletionSettings = {},
  ) =>
    new OpenAICompatibleCompletionLanguageModel(modelId, settings, {
      ...createCommonModelConfig('completion'),
      errorStructure: fireworksErrorStructure,
    });

  const createTextEmbeddingModel = (
    modelId: FireworksEmbeddingModelId,
    settings: FireworksEmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(modelId, settings, {
      ...createCommonModelConfig('embedding'),
      errorStructure: fireworksErrorStructure,
    });

  const createImageModel = (modelId: FireworksImageModelId) =>
    new FireworksImageModel(modelId, {
      ...createCommonModelConfig('image'),
      // Image model urls can vary in structure across model types, so we don't
      // rely on the common config url function.
      baseURL: baseURL ?? defaultBaseURL,
    });

  const provider = (
    modelId: FireworksChatModelId,
    settings?: FireworksChatSettings,
  ) => createChatModel(modelId, settings);

  provider.completionModel = createCompletionModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;
  provider.image = createImageModel;

  return provider as FireworksProvider;
}

export const fireworks = createFireworks();
