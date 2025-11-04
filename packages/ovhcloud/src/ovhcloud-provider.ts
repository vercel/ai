import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  OpenAICompatibleImageModel,
} from '@ai-sdk/openai-compatible';
import {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV3,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import {
  OVHcloudChatModelId,
  OVHcloudEmbeddingModelId,
  OVHcloudImageModelId,
} from './ovhcloud-chat-options';
import { VERSION } from './version';

export interface OVHcloudProviderSettings {
  /**
  OVHcloud AI Endpoints API key.
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

export interface OVHcloudProvider extends ProviderV3 {
  /**
  Creates an OVHcloud model for text generation.
  */
  (modelId: OVHcloudChatModelId): LanguageModelV3;

  /**
  Creates an OVHcloud model for text generation.
  */
  languageModel(modelId: OVHcloudChatModelId): LanguageModelV3;

  /**
  Creates an OVHcloud chat model for text generation.
  */
  chat(modelId: OVHcloudChatModelId): LanguageModelV3;

  /**
  Creates an OVHcloud text embedding model.
  */
  textEmbeddingModel(
    modelId: OVHcloudEmbeddingModelId,
  ): EmbeddingModelV3<string>;

  /**
  Creates an OVHcloud image generation model.
  */
  imageModel(modelId: OVHcloudImageModelId): ImageModelV3;
}

export function createOVHcloud(
  options: OVHcloudProviderSettings = {},
): OVHcloudProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'OVHCLOUD_AI_ENPOINTS_API_KEY',
          description: 'OVHcloud AI Endpoints API key',
        })}`,
        ...options.headers,
      },
      `vercel-ai-sdk/ovhcloud/${VERSION}`,
    );

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `ovhcloud.${modelType}`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createLanguageModel = (modelId: OVHcloudChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      ...getCommonModelConfig('chat'),
    });
  };

  const createTextEmbeddingModel = (modelId: OVHcloudEmbeddingModelId) => {
    return new OpenAICompatibleEmbeddingModel(modelId, {
      ...getCommonModelConfig('embedding'),
    });
  };

  const createImageModel = (modelId: OVHcloudImageModelId) => {
    return new OpenAICompatibleImageModel(modelId, {
      ...getCommonModelConfig('image'),
    });
  };

  const provider = (modelId: OVHcloudChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;
  provider.imageModel = createImageModel;

  return provider;
}

export const ovhcloud = createOVHcloud();
