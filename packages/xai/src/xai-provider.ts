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
import { XaiChatLanguageModel } from './xai-chat-language-model';
import { XaiChatModelId, XaiChatSettings } from './xai-chat-settings';

export interface XaiProvider extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (modelId: XaiChatModelId, settings?: XaiChatSettings): LanguageModelV1;

  /**
Creates an Xai chat model for text generation.
   */
  languageModel(
    modelId: XaiChatModelId,
    settings?: XaiChatSettings,
  ): LanguageModelV1;
}

export interface XaiProviderSettings {
  /**
Base URL for the xAI API calls.
     */
  baseURL?: string;

  /**
API key for authenticating requests.
     */
  apiKey?: string;

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

/**
Create an xAI provider instance.
 */
export function createXai(options: XaiProviderSettings = {}): XaiProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.x.ai/v1';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'XAI_API_KEY',
      description: 'xAI',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: XaiChatModelId,
    settings: XaiChatSettings = {},
  ) =>
    new XaiChatLanguageModel(modelId, settings, {
      provider: 'xai.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createLanguageModel = (
    modelId: XaiChatModelId,
    settings?: XaiChatSettings,
  ) => {
    if (new.target) {
      throw new Error(
        'The xAI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  const provider = function (
    modelId: XaiChatModelId,
    settings?: XaiChatSettings,
  ) {
    return createLanguageModel(modelId, settings);
  };

  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.rerankingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'rerankingModel' });
  };

  return provider as XaiProvider;
}

/**
Default xAI provider instance.
 */
export const xai = createXai();
