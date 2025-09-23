import {
  EmbeddingModelV3,
  LanguageModelV3,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { MistralChatLanguageModel } from './mistral-chat-language-model';
import { MistralChatModelId } from './mistral-chat-options';
import { MistralEmbeddingModel } from './mistral-embedding-model';
import { MistralEmbeddingModelId } from './mistral-embedding-options';

export interface MistralProvider extends ProviderV2 {
  (modelId: MistralChatModelId): LanguageModelV3;

  /**
Creates a model for text generation.
*/
  languageModel(modelId: MistralChatModelId): LanguageModelV3;

  /**
Creates a model for text generation.
*/
  chat(modelId: MistralChatModelId): LanguageModelV3;

  /**
@deprecated Use `textEmbedding()` instead.
   */
  embedding(modelId: MistralEmbeddingModelId): EmbeddingModelV3<string>;

  textEmbedding(modelId: MistralEmbeddingModelId): EmbeddingModelV3<string>;

  textEmbeddingModel: (
    modelId: MistralEmbeddingModelId,
  ) => EmbeddingModelV3<string>;
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

  generateId?: () => string;
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

  const createChatModel = (modelId: MistralChatModelId) =>
    new MistralChatLanguageModel(modelId, {
      provider: 'mistral.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: options.generateId,
    });

  const createEmbeddingModel = (modelId: MistralEmbeddingModelId) =>
    new MistralEmbeddingModel(modelId, {
      provider: 'mistral.embedding',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: MistralChatModelId) {
    if (new.target) {
      throw new Error(
        'The Mistral model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

/**
Default Mistral provider instance.
 */
export const mistral = createMistral();
