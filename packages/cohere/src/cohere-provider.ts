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
import { CohereChatLanguageModel } from './cohere-chat-language-model';
import { CohereChatModelId, CohereChatSettings } from './cohere-chat-settings';
import { CohereEmbeddingModel } from './cohere-embedding-model';
import {
  CohereEmbeddingModelId,
  CohereEmbeddingSettings,
} from './cohere-embedding-settings';

export interface CohereProvider extends ProviderV1 {
  (modelId: CohereChatModelId, settings?: CohereChatSettings): LanguageModelV1;

  /**
Creates a model for text generation.
*/
  languageModel(
    modelId: CohereChatModelId,
    settings?: CohereChatSettings,
  ): LanguageModelV1;

  embedding(
    modelId: CohereEmbeddingModelId,
    settings?: CohereEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  textEmbeddingModel(
    modelId: CohereEmbeddingModelId,
    settings?: CohereEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

export interface CohereProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.cohere.com/v2`.
   */
  baseURL?: string;

  /**
API key that is being send using the `Authorization` header.
It defaults to the `COHERE_API_KEY` environment variable.
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
Create a Cohere AI provider instance.
 */
export function createCohere(
  options: CohereProviderSettings = {},
): CohereProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.cohere.com/v2';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'COHERE_API_KEY',
      description: 'Cohere',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: CohereChatModelId,
    settings: CohereChatSettings = {},
  ) =>
    new CohereChatLanguageModel(modelId, settings, {
      provider: 'cohere.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createTextEmbeddingModel = (
    modelId: CohereEmbeddingModelId,
    settings: CohereEmbeddingSettings = {},
  ) =>
    new CohereEmbeddingModel(modelId, settings, {
      provider: 'cohere.textEmbedding',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: CohereChatModelId,
    settings?: CohereChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Cohere model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.embedding = createTextEmbeddingModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  return provider as CohereProvider;
}

/**
Default Cohere provider instance.
 */
export const cohere = createCohere();
