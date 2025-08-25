import {
  EmbeddingModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import { FetchFunction, loadApiKey, loadSetting } from '@ai-sdk/provider-utils';
import { HerokuEmbeddingModel } from './heroku-embedding-model';
import { HerokuEmbeddingModelId } from './heroku-embedding-options';

export interface HerokuProvider extends ProviderV2 {
  embedding(modelId: HerokuEmbeddingModelId): EmbeddingModelV2<string>;
  textEmbeddingModel(modelId: HerokuEmbeddingModelId): EmbeddingModelV2<string>;
}

export interface HerokuProviderSettings {
  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers.
   * This value defaults to `HEROKU_EMBEDDING_URL.
   */
  baseURL?: string;

  /**
   * API key that is being sent using the `Authorization` header.
   * It defaults to the `HEROKU_EMBEDDING_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
 * Create a Heroku AI provider instance.
 */
export function createHeroku(
  options: HerokuProviderSettings = {},
): HerokuProvider {
  const getHeaders = (apiKey: string) => ({
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...options.headers,
  });

  // Support for Heroku Embeddings
  const createTextEmbeddingModel = (modelId: HerokuEmbeddingModelId) => {
    const baseURL = loadSetting({
      settingName: 'baseUrl',
      settingValue: options.baseURL,
      environmentVariableName: 'HEROKU_EMBEDDING_URL',
      description: 'baseUrl',
    });

    const apiKey = loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'HEROKU_EMBEDDING_KEY',
      description: 'Heroku',
    });

    return new HerokuEmbeddingModel(modelId, {
      provider: 'heroku.textEmbedding',
      baseURL,
      headers: getHeaders(apiKey),
      fetch: options.fetch,
    });
  };

  const provider = function (modelId: string) {
    if (new.target) {
      throw new Error(
        'The Heroku model function cannot be called with the new keyword.',
      );
    }

    throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
  };

  provider.embedding = createTextEmbeddingModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;

  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
  };

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

/**
 * Default Heroku provider instance.
 */
export const heroku = createHeroku();
