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
import { SambaNovaChatLanguageModel } from './sambanova-chat-language-model';
import {
  SambaNovaChatModelId,
  SambaNovaChatSettings,
} from './sambanova-chat-settings';

export interface SambaNovaProvider extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (
    modelId: SambaNovaChatModelId,
    settings?: SambaNovaChatSettings,
  ): LanguageModelV1;

  /**
Creates a SambaNova chat model for text generation.
   */
  languageModel(
    modelId: SambaNovaChatModelId,
    settings?: SambaNovaChatSettings,
  ): LanguageModelV1;
}

export interface SambaNovaProviderSettings {
  /**
Base URL for the SambaNova API calls.
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
Create an SambaNova provider instance.
 */
export function createSambaNova(
  options: SambaNovaProviderSettings = {},
): SambaNovaProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.sambanova.ai/v1';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'SAMBANOVA_API_KEY',
      description: 'SambaNova',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: SambaNovaChatModelId,
    settings: SambaNovaChatSettings = {},
  ) =>
    new SambaNovaChatLanguageModel(modelId, settings, {
      provider: 'sambanova.chat', // TODO: Check this provider
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createLanguageModel = (
    modelId: SambaNovaChatModelId,
    settings?: SambaNovaChatSettings,
  ) => {
    if (new.target) {
      throw new Error(
        'The SambaNova model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  const provider = function (
    modelId: SambaNovaChatModelId,
    settings?: SambaNovaChatSettings,
  ) {
    return createLanguageModel(modelId, settings);
  };

  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider;
}

/**
Default SambaNova provider instance.
 */
export const sambanova = createSambaNova();
