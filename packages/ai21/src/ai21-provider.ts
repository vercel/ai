import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV3,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { AI21ChatModelId } from './ai21-chat-options';
import { VERSION } from './version';

export interface AI21ProviderSettings {
  /**
AI21 API key.
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

export interface AI21Provider extends ProviderV3 {
  /**
Creates an AI21 model for text generation.
*/
  (modelId: AI21ChatModelId): LanguageModelV3;

  /**
Creates an AI21 model for text generation.
*/
  languageModel(modelId: AI21ChatModelId): LanguageModelV3;

  /**
Creates an AI21 chat model for text generation.
*/
  chat(modelId: AI21ChatModelId): LanguageModelV3;
}

export function createAI21(options: AI21ProviderSettings = {}): AI21Provider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.ai21.com/studio/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'AI21_API_KEY',
          description: 'AI21 API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/ai21/${VERSION}`,
    );

  const createLanguageModel = (modelId: AI21ChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `ai21.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: AI21ChatModelId) => createLanguageModel(modelId);

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

export const ai21 = createAI21();
