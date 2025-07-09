import {
<<<<<<< HEAD
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
=======
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
} from '@ai-sdk/provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
<<<<<<< HEAD
import { VercelChatModelId, VercelChatSettings } from './vercel-chat-settings';
=======
import { VercelChatModelId } from './vercel-chat-options';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

export interface VercelProviderSettings {
  /**
Vercel API key.
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

<<<<<<< HEAD
export interface VercelProvider extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (modelId: VercelChatModelId, settings?: VercelChatSettings): LanguageModelV1;

  /**
Creates a chat model for text generation.
*/
  chatModel(
    modelId: VercelChatModelId,
    settings?: VercelChatSettings,
  ): LanguageModelV1;
=======
export interface VercelProvider extends ProviderV2 {
  /**
Creates a model for text generation.
*/
  (modelId: VercelChatModelId): LanguageModelV2;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

  /**
Creates a language model for text generation.
*/
<<<<<<< HEAD
  languageModel(
    modelId: VercelChatModelId,
    settings?: VercelChatSettings,
  ): LanguageModelV1;
=======
  languageModel(modelId: VercelChatModelId): LanguageModelV2;
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
}

export function createVercel(
  options: VercelProviderSettings = {},
): VercelProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.v0.dev/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'VERCEL_API_KEY',
      description: 'Vercel',
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
    provider: `vercel.${modelType}`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

<<<<<<< HEAD
  const createChatModel = (
    modelId: VercelChatModelId,
    settings: VercelChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...getCommonModelConfig('chat'),
      defaultObjectGenerationMode: 'json',
    });
  };

  const provider = (
    modelId: VercelChatModelId,
    settings?: VercelChatSettings,
  ) => createChatModel(modelId, settings);

  provider.chatModel = createChatModel;
=======
  const createChatModel = (modelId: VercelChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      ...getCommonModelConfig('chat'),
    });
  };

  const provider = (modelId: VercelChatModelId) => createChatModel(modelId);

>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
<<<<<<< HEAD
=======
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9

  return provider;
}

export const vercel = createVercel();
