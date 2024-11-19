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
import { OpenAICompatibleCompletionLanguageModel } from './openai-compatible-completion-language-model';
import { OpenAICompatibleCompletionSettings } from './openai-compatible-completion-settings';
import { OpenAICompatibleEmbeddingSettings } from './openai-compatible-embedding-settings';
import { OpenAICompatibleEmbeddingModel } from './openai-compatible-embedding-model';

export interface OpenAICompatibleProvider<
  L extends string = string,
  C extends string = string,
  E extends string = string,
> extends ProviderV1 {
  (modelId: L, settings?: OpenAICompatibleChatSettings): LanguageModelV1;

  languageModel(
    modelId: L,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  chatModel(
    modelId: L,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  completionModel(
    modelId: C,
    settings?: OpenAICompatibleCompletionSettings,
  ): LanguageModelV1;

  textEmbeddingModel(
    modelId: E,
    settings?: OpenAICompatibleEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

export interface OpenAICompatibleProviderSettings {
  /**
Base URL for the API calls.
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
The name of the environment variable from which to load the API key (if a key isn't explicitly provided).
   */
  apiKeyEnvVarName?: string;

  /**
Description of the API key environment variable (for use in error messages).
   */
  apiKeyEnvVarDescription?: string;

  /**
Provider name. Overrides the `openai` default name for 3rd party providers.
   */
  name?: string;
}

/**
Create an OpenAICompatible provider instance.
 */
export function createOpenAICompatible<
  L extends string,
  C extends string,
  E extends string,
>(
  options: OpenAICompatibleProviderSettings,
): OpenAICompatibleProvider<L, C, E> {
  // TODO(shaper):
  // - consider throwing if baseUrl, name, sufficient api key info not available
  // - force only 'compatible' -- look into whether we can remove some 'strict' logic/configs entirely
  const baseURL = withoutTrailingSlash(options.baseURL);
  const providerName = options.name ?? 'openaiCompatible';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: options.apiKeyEnvVarName ?? '',
      description: options.apiKeyEnvVarDescription ?? '',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (
    modelId: L,
    settings?: OpenAICompatibleChatSettings,
  ) => createChatModel(modelId, settings);

  // TODO(shaper): Change provider strings below to allow concrete impls to specify.
  // See openai-provider.ts:141 and subsequent configs.
  const createChatModel = (
    modelId: L,
    settings: OpenAICompatibleChatSettings = {},
  ) =>
    new OpenAICompatibleChatLanguageModel(modelId, settings, {
      provider: `${providerName}.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createCompletionModel = (
    modelId: C,
    settings: OpenAICompatibleCompletionSettings = {},
  ) =>
    new OpenAICompatibleCompletionLanguageModel(modelId, settings, {
      provider: `${providerName}.completion`,
      compatibility: 'compatible',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (
    modelId: E,
    settings: OpenAICompatibleEmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(modelId, settings, {
      provider: `${providerName}.embedding`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: L,
    settings?: OpenAICompatibleChatSettings,
  ) {
    return createLanguageModel(modelId, settings);
  };

  provider.languageModel = createLanguageModel;
  provider.chatModel = createChatModel;
  provider.completionModel = createCompletionModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider as OpenAICompatibleProvider<L, C, E>;
}
