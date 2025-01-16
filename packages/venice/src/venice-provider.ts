import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
  ImageModelV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import {
  VeniceChatModelId,
  VeniceChatSettings,
} from './venice-chat-settings';
import {
  VeniceAIImageModelId,
  VeniceAIImageSettings,
} from './venice-image-settings';
import { VeniceAIImageModel } from './venice-image-model';
import { z } from 'zod';
import { ProviderErrorStructure } from '@ai-sdk/openai-compatible';

// Add error schema and structure
const veniceErrorSchema = z.object({
  error: z.string(),
});

export type VeniceErrorData = z.infer<typeof veniceErrorSchema>;

const veniceErrorStructure: ProviderErrorStructure<VeniceErrorData> = {
  errorSchema: veniceErrorSchema,
  errorToMessage: data => data.error,
};

export interface VeniceProviderSettings {
  /**
Venice API key.
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

export interface VeniceProvider extends ProviderV1 {
  /**
Creates a Venice model for text generation.
*/
  (
    modelId: VeniceChatModelId,
    settings?: VeniceChatSettings,
  ): LanguageModelV1;

  /**
Creates a Venice model for text generation.
*/
  languageModel(
    modelId: VeniceChatModelId,
    settings?: VeniceChatSettings,
  ): LanguageModelV1;

  /**
Creates a Venice chat model for text generation.
*/
  chat(
    modelId: VeniceChatModelId,
    settings?: VeniceChatSettings,
  ): LanguageModelV1;

  /**
Creates a Venice image model for image generation.
*/
  imageModel(
    modelId: VeniceAIImageModelId,
    settings?: VeniceAIImageSettings,
  ): ImageModelV1;
}

export function createVenice(
  options: VeniceProviderSettings = {},
): VeniceProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.venice.ai/api/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'VENICE_API_KEY',
      description: 'Venice API key',
    })}`,
    ...options.headers,
  });

  const config = {
    provider: 'venice',
    url: ({ path }: { path: string }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  };

  const createLanguageModel = (
    modelId: VeniceChatModelId,
    settings: VeniceChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...config,
      provider: `${config.provider}.chat`,
      defaultObjectGenerationMode: 'tool',
      errorStructure: veniceErrorStructure,
    });
  };

  const createImageModel = (
    modelId: VeniceAIImageModelId,
    settings: VeniceAIImageSettings = {},
  ) => {
    return new VeniceAIImageModel(modelId, settings, {
      ...config,
      provider: `${config.provider}.image`,
    });
  };

  const provider = (
    modelId: VeniceChatModelId,
    settings?: VeniceChatSettings,
  ) => createLanguageModel(modelId, settings);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.imageModel = createImageModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider as VeniceProvider;
}

export const venice = createVenice();
