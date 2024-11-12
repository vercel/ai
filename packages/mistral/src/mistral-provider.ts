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
import { MistralChatLanguageModel } from './mistral-chat-language-model';
import {
  MistralChatModelId,
  MistralChatSettings,
} from './mistral-chat-settings';
import { MistralEmbeddingModel } from './mistral-embedding-model';
import {
  MistralEmbeddingModelId,
  MistralEmbeddingSettings,
} from './mistral-embedding-settings';

export interface MistralProvider extends ProviderV1 {
  (
    modelId: MistralChatModelId,
    settings?: MistralChatSettings,
  ): LanguageModelV1;

  /**
Creates a model for text generation.
*/
  languageModel(
    modelId: MistralChatModelId,
    settings?: MistralChatSettings,
  ): LanguageModelV1;

  /**
Creates a model for text generation.
*/
  chat(
    modelId: MistralChatModelId,
    settings?: MistralChatSettings,
  ): LanguageModelV1;

  /**
@deprecated Use `textEmbeddingModel()` instead.
   */
  embedding(
    modelId: MistralEmbeddingModelId,
    settings?: MistralEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  /**
@deprecated Use `textEmbeddingModel()` instead.
   */
  textEmbedding(
    modelId: MistralEmbeddingModelId,
    settings?: MistralEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  textEmbeddingModel: (
    modelId: MistralEmbeddingModelId,
    settings?: MistralEmbeddingSettings,
  ) => EmbeddingModelV1<string>;
}

export interface MistralProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.mistral.ai/v1`.
   */
  baseURL?: string;

  /**
API key that is being send using the `Authorization` header.
It defaults to the `MISTRAL_API_KEY` environment variable.
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
Create a Mistral AI provider instance.
 */
export function createMistral(
  options: MistralProviderSettings = {},
): MistralProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.mistral.ai/v1';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'MISTRAL_API_KEY',
      description: 'Mistral',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: MistralChatModelId,
    settings: MistralChatSettings = {},
  ) =>
    new MistralChatLanguageModel(modelId, settings, {
      provider: 'mistral.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (
    modelId: MistralEmbeddingModelId,
    settings: MistralEmbeddingSettings = {},
  ) =>
    new MistralEmbeddingModel(modelId, settings, {
      provider: 'mistral.embedding',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: MistralChatModelId,
    settings?: MistralChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Mistral model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider as MistralProvider;
}

/**
Default Mistral provider instance.
 */
export const mistral = createMistral();
