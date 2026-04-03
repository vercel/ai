import {
  EmbeddingModelV4,
  NoSuchModelError,
  ProviderV4,
  RerankingModelV4,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { ZeroEntropyEmbeddingModel } from './zeroentropy-embedding-model';
import {
  ZeroEntropyEmbeddingModelId,
  ZeroEntropyEmbeddingModelOptions,
} from './zeroentropy-embedding-options';
import { ZeroEntropyRerankingModel } from './reranking/zeroentropy-reranking-model';
import { ZeroEntropyRerankingModelId } from './reranking/zeroentropy-reranking-options';
import { VERSION } from './version';

export interface ZeroEntropyProvider extends ProviderV4 {
  /**
   * Creates a model for text embeddings.
   */
  embedding(
    modelId: ZeroEntropyEmbeddingModelId,
    options?: ZeroEntropyEmbeddingModelOptions,
  ): EmbeddingModelV4;

  /**
   * Creates a model for text embeddings.
   */
  embeddingModel(
    modelId: ZeroEntropyEmbeddingModelId,
    options?: ZeroEntropyEmbeddingModelOptions,
  ): EmbeddingModelV4;

  /**
   * @deprecated Use `embedding` instead.
   */
  textEmbedding(
    modelId: ZeroEntropyEmbeddingModelId,
    options?: ZeroEntropyEmbeddingModelOptions,
  ): EmbeddingModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(
    modelId: ZeroEntropyEmbeddingModelId,
    options?: ZeroEntropyEmbeddingModelOptions,
  ): EmbeddingModelV4;

  /**
   * Creates a model for reranking documents.
   */
  reranking(modelId: ZeroEntropyRerankingModelId): RerankingModelV4;

  /**
   * Creates a model for reranking documents.
   */
  rerankingModel(modelId: ZeroEntropyRerankingModelId): RerankingModelV4;
}

export interface ZeroEntropyProviderSettings {
  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers.
   * The default prefix is `https://api.zeroentropy.dev/v1`.
   */
  baseURL?: string;

  /**
   * API key sent using the `Authorization` header.
   * Defaults to the `ZEROENTROPY_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
 * Create a ZeroEntropy provider instance.
 */
export function createZeroEntropy(
  options: ZeroEntropyProviderSettings = {},
): ZeroEntropyProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.zeroentropy.dev/v1';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ZEROENTROPY_API_KEY',
          description: 'ZeroEntropy',
        })}`,
        ...options.headers,
      },
      `ai-sdk/zeroentropy/${VERSION}`,
    );

  const createEmbeddingModel = (
    modelId: ZeroEntropyEmbeddingModelId,
    modelOptions: ZeroEntropyEmbeddingModelOptions = {},
  ) =>
    new ZeroEntropyEmbeddingModel(modelId, modelOptions, {
      provider: 'zeroentropy.embedding',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createRerankingModel = (modelId: ZeroEntropyRerankingModelId) =>
    new ZeroEntropyRerankingModel(modelId, {
      provider: 'zeroentropy.reranking',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = {
    specificationVersion: 'v4' as const,
    embedding: createEmbeddingModel,
    embeddingModel: createEmbeddingModel,
    textEmbedding: createEmbeddingModel,
    textEmbeddingModel: createEmbeddingModel,
    reranking: createRerankingModel,
    rerankingModel: createRerankingModel,
    languageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },
    imageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  };

  return provider as ZeroEntropyProvider;
}

/**
 * Default ZeroEntropy provider instance.
 */
export const zeroentropy = createZeroEntropy();
