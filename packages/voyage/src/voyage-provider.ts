import {
  EmbeddingModelV3,
  NoSuchModelError,
  RerankingModelV3,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { VoyageEmbeddingModel } from './voyage-embedding-model';
import { VoyageEmbeddingModelId } from './voyage-embedding-options';
import { VoyageRerankingModel } from './reranking/voyage-reranking-model';
import { VoyageRerankingModelId } from './reranking/voyage-reranking-options';
import { VERSION } from './version';

export interface VoyageProvider extends ProviderV3 {
  embedding(modelId: VoyageEmbeddingModelId): EmbeddingModelV3;

  embeddingModel(modelId: VoyageEmbeddingModelId): EmbeddingModelV3;

  textEmbedding(modelId: VoyageEmbeddingModelId): EmbeddingModelV3;

  textEmbeddingModel(modelId: VoyageEmbeddingModelId): EmbeddingModelV3;

  reranking(modelId: VoyageRerankingModelId): RerankingModelV3;

  rerankingModel(modelId: VoyageRerankingModelId): RerankingModelV3;
}

export interface VoyageProviderSettings {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
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
          description: 'Voyage',
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
    throw new NoSuchModelError({
      modelId: '',
      modelType: 'languageModel',
    });
  };

  provider.specificationVersion = 'v3' as const;

  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
  };

  provider.embedding = createEmbeddingModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.reranking = createRerankingModel;
  provider.rerankingModel = createRerankingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as VoyageProvider;
}

export const voyage = createVoyage();
