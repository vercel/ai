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
import { GrokChatLanguageModel } from './grok-chat-language-model';
import { GrokChatModelId, GrokChatSettings } from './grok-chat-settings';

export interface GrokProvider extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (modelId: GrokChatModelId, settings?: GrokChatSettings): LanguageModelV1;

  /**
Creates an Grok chat model for text generation.
   */
  languageModel(
    modelId: GrokChatModelId,
    settings?: GrokChatSettings,
  ): LanguageModelV1;
}

export interface GrokProviderSettings {
  /**
Base URL for the Grok API calls.
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
Create an Grok provider instance.
 */
export function createGrok(options: GrokProviderSettings = {}): GrokProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.x.ai/v1';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'GROK_API_KEY',
      description: 'Grok',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: GrokChatModelId,
    settings: GrokChatSettings = {},
  ) =>
    new GrokChatLanguageModel(modelId, settings, {
      provider: 'grok.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createLanguageModel = (
    modelId: GrokChatModelId,
    settings?: GrokChatSettings,
  ) => {
    if (new.target) {
      throw new Error(
        'The Grok model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  const provider = function (
    modelId: GrokChatModelId,
    settings?: GrokChatSettings,
  ) {
    return createLanguageModel(modelId, settings);
  };

  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider as GrokProvider;
}

/**
Default Grok provider instance.
 */
export const grok = createGrok();
