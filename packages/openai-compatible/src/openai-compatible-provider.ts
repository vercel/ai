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
import { OpenAICompatibleChatLanguageModel } from './openai-compatible-chat-language-model';
import { OpenAICompatibleChatSettings } from './openai-compatible-chat-settings';
import { OpenAICompatibleCompletionSettings } from './openai-compatible-completion-settings';
import { OpenAICompatibleEmbeddingSettings } from './openai-compatible-embedding-settings';
import { OpenAICompatibleEmbeddingModel } from './openai-compatible-embedding-model';

export interface OpenAICompatibleProvider<M extends string = string>
  extends ProviderV1 {
  (modelId: M, settings?: OpenAICompatibleChatSettings): LanguageModelV1;

  languageModel(
    modelId: M,
    settings?: OpenAICompatibleCompletionSettings,
  ): LanguageModelV1;

  chatModel(
    modelId: M,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  textEmbeddingModel(
    modelId: M,
    settings?: OpenAICompatibleEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

export interface OpenAICompatibleProviderSettings {
  /**
Base URL for the OpenAICompatible API calls.
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
Create an OpenAICompatible provider instance.
 */
export function createOpenAICompatible<M extends string>(
  options: OpenAICompatibleProviderSettings,
): OpenAICompatibleProvider<M> {
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
    settings?: OpenAICompatibleCompletionSettings,
  ) => {
    if (new.target) {
      throw new Error(
        'The OpenAICompatible model function cannot be called with the new keyword.',
      );
    }

    // TODO(shaper): Do we need to pull in and strip down the OpenAI Completion Model?
    return createChatModel(modelId, settings);
  };

  const createChatModel = (
    modelId: M,
    settings: OpenAICompatibleChatSettings = {},
  ) =>
    new OpenAICompatibleChatLanguageModel(modelId, settings, {
      provider: 'openAICompatible.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (
    modelId: M,
    settings: OpenAICompatibleEmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(modelId, settings, {
      provider: 'openaiCompatible.embedding',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: M,
    settings?: OpenAICompatibleChatSettings,
  ) {
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

  return provider as OpenAICompatibleProvider<M>;
}
