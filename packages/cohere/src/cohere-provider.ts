import {
  EmbeddingModelV3,
  LanguageModelV2,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { CohereChatLanguageModel } from './cohere-chat-language-model';
import { CohereChatModelId } from './cohere-chat-options';
import { CohereEmbeddingModel } from './cohere-embedding-model';
import { CohereEmbeddingModelId } from './cohere-embedding-options';
import { VERSION } from './version';

export interface CohereProvider extends ProviderV3 {
  (modelId: CohereChatModelId): LanguageModelV2;

  /**
Creates a model for text generation.
*/
  languageModel(modelId: CohereChatModelId): LanguageModelV2;

  embedding(modelId: CohereEmbeddingModelId): EmbeddingModelV3<string>;

  textEmbeddingModel(modelId: CohereEmbeddingModelId): EmbeddingModelV3<string>;
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

  /**
Optional function to generate a unique ID for each request.
     */
  generateId?: () => string;
}

/**
Create a Cohere AI provider instance.
 */
export function createCohere(
  options: CohereProviderSettings = {},
): CohereProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.cohere.com/v2';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'COHERE_API_KEY',
          description: 'Cohere',
        })}`,
        ...options.headers,
      },
      `ai-sdk/cohere/${VERSION}`,
    );

  const createChatModel = (modelId: CohereChatModelId) =>
    new CohereChatLanguageModel(modelId, {
      provider: 'cohere.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: options.generateId ?? generateId,
    });

  const createTextEmbeddingModel = (modelId: CohereEmbeddingModelId) =>
    new CohereEmbeddingModel(modelId, {
      provider: 'cohere.textEmbedding',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: CohereChatModelId) {
    if (new.target) {
      throw new Error(
        'The Cohere model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  provider.languageModel = createChatModel;
  provider.embedding = createTextEmbeddingModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

/**
Default Cohere provider instance.
 */
export const cohere = createCohere();
