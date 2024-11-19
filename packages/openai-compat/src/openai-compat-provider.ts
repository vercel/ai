import {
  EmbeddingModelV1,
  LanguageModelV1,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { OpenAICompatChatLanguageModel } from './openai-compat-chat-language-model';
import { OpenAICompatChatSettings } from './openai-compat-chat-settings';
import { OpenAICompatCompletionSettings } from './openai-compat-completion-settings';
import { OpenAICompatEmbeddingSettings } from './openai-compat-embedding-settings';
import { OpenAICompatEmbeddingModel } from './openai-compat-embedding-model';

export interface OpenAICompatProvider<M extends string = string>
  extends ProviderV1 {
  (modelId: M, settings?: OpenAICompatChatSettings): LanguageModelV1;

  languageModel(
    modelId: M,
    settings?: OpenAICompatCompletionSettings,
  ): LanguageModelV1;

  chatModel(modelId: M, settings?: OpenAICompatChatSettings): LanguageModelV1;

  textEmbeddingModel(
    modelId: M,
    settings?: OpenAICompatEmbeddingSettings,
  ): EmbeddingModelV1<string>;
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

  /**
The name of the environment variable from which to load the API key if not explicitly provided.
   */
  apiKeyEnvVarName?: string;

  /**
Description of the API key environment variable for error messages.
   */
  apiKeyEnvVarDescription?: string;
}

/**
Create an OpenAICompat provider instance.
 */
export function createOpenAICompat<M extends string>(
  options: OpenAICompatProviderSettings,
): OpenAICompatProvider<M> {
  // TODO(shaper): Throw if baseURL isn't set.
  const baseURL = withoutTrailingSlash(options.baseURL);

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: options.apiKeyEnvVarName ?? '',
      description: options.apiKeyEnvVarDescription ?? '',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (
    modelId: M,
    settings?: OpenAICompatCompletionSettings,
  ) => {
    if (new.target) {
      throw new Error(
        'The OpenAICompat model function cannot be called with the new keyword.',
      );
    }

    // TODO(shaper): Do we need to pull in and strip down the OpenAI Completion Model?
    return createChatModel(modelId, settings);
  };

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

  const createEmbeddingModel = (
    modelId: M,
    settings: OpenAICompatEmbeddingSettings = {},
  ) =>
    new OpenAICompatEmbeddingModel(modelId, settings, {
      provider: 'openaiCompat.embedding',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: M, settings?: OpenAICompatChatSettings) {
    return createLanguageModel(modelId, settings);
  };

  provider.languageModel = createLanguageModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  // TODO(shaper): Need a way for concrete impls to note if they don't support
  // one of the model types.
  // provider.textEmbeddingModel = (modelId: string) => {
  //   throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  // };

  return provider as OpenAICompatProvider<M>;
}
