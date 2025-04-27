import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { DeepSeekChatModelId } from './deepseek-chat-options';
import { deepSeekMetadataExtractor } from './deepseek-metadata-extractor';

export interface DeepSeekProviderSettings {
  /**
DeepSeek API key.
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

export interface DeepSeekProvider extends ProviderV2 {
  /**
Creates a DeepSeek model for text generation.
*/
  (modelId: DeepSeekChatModelId): LanguageModelV2;

  /**
Creates a DeepSeek model for text generation.
*/
  languageModel(modelId: DeepSeekChatModelId): LanguageModelV2;

  /**
Creates a DeepSeek chat model for text generation.
*/
  chat(modelId: DeepSeekChatModelId): LanguageModelV2;
}

export function createDeepSeek(
  options: DeepSeekProviderSettings = {},
): DeepSeekProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.deepseek.com/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'DEEPSEEK_API_KEY',
      description: 'DeepSeek API key',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (modelId: DeepSeekChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `deepseek.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      metadataExtractor: deepSeekMetadataExtractor,
    });
  };

  const provider = (modelId: DeepSeekChatModelId) =>
    createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const deepseek = createDeepSeek();
