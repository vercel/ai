import {
  type ImageModelV2,
  NoSuchModelError,
  type ProviderV2,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { ProdiaImageModel } from './prodia-image-model';
import type { ProdiaImageModelId } from './prodia-image-settings';
import { VERSION } from './version';

export interface ProdiaProviderSettings {
  /**
   * Prodia API key. Default value is taken from the `PRODIA_TOKEN` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls. Defaults to `https://inference.prodia.com/v2`.
   */
  baseURL?: string;

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

export interface ProdiaProvider extends ProviderV2 {
  /**
   * Creates a model for image generation.
   */
  image(modelId: ProdiaImageModelId): ImageModelV2;

  /**
   * Creates a model for image generation.
   */
  imageModel(modelId: ProdiaImageModelId): ImageModelV2;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

const defaultBaseURL = 'https://inference.prodia.com/v2';

export function createProdia(
  options: ProdiaProviderSettings = {},
): ProdiaProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'PRODIA_TOKEN',
          description: 'Prodia',
        })}`,
        ...options.headers,
      },
      `ai-sdk/prodia/${VERSION}`,
    );

  const createImageModel = (modelId: ProdiaImageModelId) =>
    new ProdiaImageModel(modelId, {
      provider: 'prodia.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'textEmbeddingModel',
    });
  };

  const languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
    });
  };

  return {
    imageModel: createImageModel,
    image: createImageModel,
    languageModel,
    textEmbeddingModel,
  };
}

export const prodia = createProdia();
