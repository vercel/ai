import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import {
  CerebrasChatModelId,
  CerebrasChatSettings,
} from './cerebras-chat-settings';

export interface CerebrasProviderSettings {
  /**
Cerebras API key.
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

export interface CerebrasProvider extends ProviderV1 {
  /**
Creates a Cerebras model for text generation.
*/
  (
    modelId: CerebrasChatModelId,
    settings?: CerebrasChatSettings,
  ): LanguageModelV1;

  /**
Creates a Cerebras model for text generation.
*/
  languageModel(
    modelId: CerebrasChatModelId,
    settings?: CerebrasChatSettings,
  ): LanguageModelV1;

  /**
Creates a Cerebras chat model for text generation.
*/
  chat(
    modelId: CerebrasChatModelId,
    settings?: CerebrasChatSettings,
  ): LanguageModelV1;
}

export function createCerebras(
  options: CerebrasProviderSettings = {},
): CerebrasProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.cerebras.ai/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'CEREBRAS_API_KEY',
      description: 'Cerebras API key',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (
    modelId: CerebrasChatModelId,
    settings: CerebrasChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      provider: `cerebras.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      defaultObjectGenerationMode: 'json',
    });
  };

  const provider = (
    modelId: CerebrasChatModelId,
    settings?: CerebrasChatSettings,
  ) => createLanguageModel(modelId, settings);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider as CerebrasProvider;
}

export const cerebras = createCerebras();
