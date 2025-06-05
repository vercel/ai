import {
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { VercelChatModelId, VercelChatSettings } from './vercel-chat-settings';

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

export interface VercelProvider extends ProviderV2 {
  /**
Creates a model for text generation.
*/
  (modelId: VercelChatModelId, settings?: VercelChatSettings): LanguageModelV2;

  /**
Creates a language model for text generation.
*/
  languageModel(
    modelId: VercelChatModelId,
    settings?: VercelChatSettings,
  ): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  chatModel(
    modelId: VercelChatModelId,
    settings?: VercelChatSettings,
  ): LanguageModelV2;
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

  const createChatModel = (
    modelId: VercelChatModelId,
    settings: VercelChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      ...getCommonModelConfig('chat'),
      ...settings,
    });
  };

  const provider = (
    modelId: VercelChatModelId,
    settings?: VercelChatSettings,
  ) => createChatModel(modelId, settings);

  provider.languageModel = createChatModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const vercel = createVercel();
