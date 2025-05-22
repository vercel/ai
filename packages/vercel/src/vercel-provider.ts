import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
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

  /**
Creates a language model for text generation.
*/
  languageModel(
    modelId: VercelChatModelId,
    settings?: VercelChatSettings,
  ): LanguageModelV1;
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
  provider.languageModel = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider;
}

export const vercel = createVercel();
