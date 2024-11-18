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
import { OpenAICompatChatLanguageModel } from './openai-compat-chat-language-model';
import {
  OpenAICompatChatModelId,
  OpenAICompatChatSettings,
} from './openai-compat-chat-settings';

export interface OpenAICompatProvider<M extends string = string>
  extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (modelId: M, settings?: OpenAICompatChatSettings): LanguageModelV1;

  /**
Creates an OpenAICompat chat model for text generation.
   */
  languageModel(
    modelId: M,
    settings?: OpenAICompatChatSettings,
  ): LanguageModelV1;
}

export interface OpenAICompatProviderSettings {
  /**
Base URL for the OpenAICompat API calls.
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
Create an OpenAICompat provider instance.
 */
export function createOpenAICompat<M extends string>(
  options: OpenAICompatProviderSettings = {},
): OpenAICompatProvider<M> {
  // TODO(shaper): Generalize:
  // - base url
  // - api key name
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.x.ai/v1';

  const getHeaders = () => ({
    // TODO(shaper): Need to use an interface for the below, and/or throw.
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'OPENAI_COMPAT_API_KEY',
      description: 'OpenAICompat API key',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: M,
    settings: OpenAICompatChatSettings = {},
  ) =>
    new OpenAICompatChatLanguageModel(modelId, settings, {
      provider: 'openaiCompat.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createLanguageModel = (
    modelId: M,
    settings?: OpenAICompatChatSettings,
  ) => {
    if (new.target) {
      throw new Error(
        'The OpenAICompat model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  const provider = function (modelId: M, settings?: OpenAICompatChatSettings) {
    return createLanguageModel(modelId, settings);
  };

  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider as OpenAICompatProvider<M>;
}

/**
Default OpenAICompat provider instance.
 */
export const openaiCompat = createOpenAICompat();
