import {
  EmbeddingModelV3,
  NoSuchModelError,
  ProviderV3,
  RerankingModelV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { VoyageEmbeddingModel } from './embedding/voyage-embedding-model';
import { VoyageEmbeddingModelId } from './embedding/voyage-embedding-options';
import { VoyageRerankingModel } from './reranking/voyage-reranking-model';
import { VoyageRerankingModelId } from './reranking/voyage-reranking-options';
import { VERSION } from './version';

export interface VoyageProviderSettings {
  /**
   * Voyage AI API key.
   */
  apiKey?: string;
  /**
   * Base URL for the API calls.
   */
  baseURL?: string;
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

export interface VoyageProvider extends ProviderV3 {
  /**
   * Creates a model for text embeddings.
   */
  embedding(modelId: VoyageEmbeddingModelId): EmbeddingModelV3;

  /**
   * Creates a model for text embeddings.
   */
  embeddingModel(modelId: VoyageEmbeddingModelId): EmbeddingModelV3;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: VoyageEmbeddingModelId): EmbeddingModelV3;

  /**
   * Creates a model for reranking.
   */
  reranking(modelId: VoyageRerankingModelId): RerankingModelV3;

  /**
   * Creates a model for reranking.
   */
  rerankingModel(modelId: VoyageRerankingModelId): RerankingModelV3;
}

export function createVoyage(
  options: VoyageProviderSettings = {},
): VoyageProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.voyageai.com/v1';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'VOYAGE_API_KEY',
          description: 'Voyage AI',
        })}`,
        ...options.headers,
      },
      `ai-sdk/voyage/${VERSION}`,
    );

  const createEmbeddingModel = (modelId: VoyageEmbeddingModelId) =>
    new VoyageEmbeddingModel(modelId, {
      provider: 'voyage.embedding',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createRerankingModel = (modelId: VoyageRerankingModelId) =>
    new VoyageRerankingModel(modelId, {
      provider: 'voyage.reranking',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function () {
    throw new NoSuchModelError({ modelId: '', modelType: 'languageModel' });
  };

  provider.specificationVersion = 'v3' as const;

  provider.embedding = createEmbeddingModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  provider.reranking = createRerankingModel;
  provider.rerankingModel = createRerankingModel;

  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
  };

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as VoyageProvider;
}

export const voyage = createVoyage();
