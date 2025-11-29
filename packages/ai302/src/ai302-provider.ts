import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
} from '@ai-sdk/provider';
import { AI302ImageModelId, AI302ImageSettings } from './ai302-image-settings';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { AI302ImageModel } from './ai302-image-model';
import { AI302Config } from './ai302-config';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import { AI302ChatSettings, AI302ChatModelId } from './ai302-chat-settings';
import { AI302EmbeddingModelId } from './ai302-embedding-settings';
import { z } from 'zod';
import { AI302EmbeddingSettings } from './ai302-embedding-settings';

export type AI302ErrorData = z.infer<typeof ai302ErrorSchema>;

const ai302ErrorSchema = z.object({
  error: z.object({
    message: z.string(),
  }),
});

const ai302ErrorStructure: ProviderErrorStructure<AI302ErrorData> = {
  errorSchema: ai302ErrorSchema,
  errorToMessage: error => error.error.message,
};

export interface AI302ProviderSettings {
  /**
  AI302 API key. Default value is taken from the `AI302_API_KEY`
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

export interface AI302Provider {
  /**
    Creates a model for text generation.
    */
  (modelId: AI302ChatModelId, settings?: AI302ChatSettings): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  chatModel(
    modelId: AI302ChatModelId,
    settings?: AI302ChatSettings,
  ): LanguageModelV2;

  /**
  Creates a text embedding model for text generation.
  */
  textEmbeddingModel(
    modelId: AI302EmbeddingModelId,
    settings?: AI302EmbeddingSettings,
  ): EmbeddingModelV2<string>;

  /**
  Creates a model for image generation.
  */
  image(
    modelId: AI302ImageModelId,
    settings?: AI302ImageSettings,
  ): ImageModelV2;
}

const defaultBaseURL = 'https://api.302.ai';

export function createAI302(
  options: AI302ProviderSettings = {},
): AI302Provider {
  const baseURL = withoutTrailingSlash(options.baseURL) ?? defaultBaseURL;
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AI302_API_KEY',
      description: '302 AI API key',
    })}`,
    'mj-api-secret': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AI302_API_KEY',
      description: 'Midjourney API key',
    }),
    ...options.headers,
  });

  const getCommonModelConfig = (modelType: string): AI302Config => ({
    provider: `ai302.${modelType}`,
    url: ({ modelId, path }) => {
      if (modelType === 'embedding') {
        if (modelId.includes('jina')) {
          return `${baseURL}/jina/v1${path}`;
        }
        return `${baseURL}/v1${path}`;
      }
      return `${baseURL}${path}`;
    },
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createImageModel = (
    modelId: AI302ImageModelId,
    settings?: AI302ImageSettings,
  ) => {
    return new AI302ImageModel(
      modelId,
      settings ?? {},
      getCommonModelConfig('image'),
    );
  };

  const createChatModel = (
    modelId: AI302ChatModelId,
    settings: AI302ChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      ...getCommonModelConfig('chat'),
      errorStructure: ai302ErrorStructure,
    });
  };

  const createTextEmbeddingModel = (
    modelId: AI302EmbeddingModelId,
    settings: AI302EmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(modelId, {
      ...getCommonModelConfig('embedding'),
      errorStructure: ai302ErrorStructure,
    });

  const provider = (modelId: AI302ChatModelId, settings?: AI302ChatSettings) =>
    createChatModel(modelId, settings);

  provider.languageModel = createChatModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;
  provider.image = createImageModel;

  return provider as AI302Provider;
}

export const ai302 = createAI302();
