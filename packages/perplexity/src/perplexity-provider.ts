import {
  NoSuchModelError,
  type EmbeddingModelV4,
  type LanguageModelProviderV4,
  type EmbeddingModelProviderV4,
  type ImageModelProviderV4,
} from '@ai-sdk/provider';
import {
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { PerplexityEmbeddingModel } from './perplexity-embedding-model';
import type { PerplexityEmbeddingModelId } from './perplexity-embedding-model-options';
import { PerplexityLanguageModel } from './perplexity-language-model';
import type { PerplexityLanguageModelId } from './perplexity-options';
import { VERSION } from './version';

export interface PerplexityProvider
  extends
    LanguageModelProviderV4<PerplexityLanguageModelId>,
    EmbeddingModelProviderV4<PerplexityEmbeddingModelId>,
    ImageModelProviderV4 {
  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: PerplexityEmbeddingModelId): EmbeddingModelV4;
}

export interface PerplexityProviderSettings {
  /**
   * Base URL for Perplexity API calls.
   */
  baseURL?: string;

  /**
   * API key for authenticating requests.
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

export function createPerplexity(
  options: PerplexityProviderSettings = {},
): PerplexityProvider {
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'PERPLEXITY_API_KEY',
          description: 'Perplexity',
        })}`,
        'X-Pplx-Integration': 'vercel-ai-sdk',
        ...options.headers,
      },
      `ai-sdk-perplexity/${VERSION}`,
    );

  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.perplexity.ai',
  )!;

  const createLanguageModel = (modelId: PerplexityLanguageModelId) => {
    return new PerplexityLanguageModel(modelId, {
      baseURL,
      headers: getHeaders,
      generateId,
      fetch: options.fetch,
    });
  };

  const createEmbeddingModel = (modelId: PerplexityEmbeddingModelId) =>
    new PerplexityEmbeddingModel(modelId, {
      provider: 'perplexity.embedding',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: PerplexityLanguageModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;

  provider.embedding = createEmbeddingModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  provider.image = provider.imageModel;

  return provider;
}

export const perplexity = createPerplexity();
