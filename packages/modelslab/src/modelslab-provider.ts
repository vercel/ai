import {
  ImageModelV2,
  LanguageModelV2,
  EmbeddingModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { ModelslabImageModel } from './modelslab-image-model';
import { ModelslabImageModelId } from './modelslab-image-settings';

export interface ModelslabProviderSettings {
  /**
   * ModelsLab API key. Default value is taken from the `MODELSLAB_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   * The default prefix is `https://modelslab.com`.
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

export interface ModelslabProvider extends ProviderV2 {
  /**
   * Creates a model for image generation.
   */
  image(modelId: ModelslabImageModelId): ImageModelV2;

  /**
   * Creates a model for image generation.
   */
  imageModel(modelId: ModelslabImageModelId): ImageModelV2;

  /**
   * Creates a language model (not supported - throws error).
   */
  languageModel(modelId: string): LanguageModelV2;

  /**
   * Creates a text embedding model (not supported - throws error).
   */
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string>;
}

const defaultBaseURL = 'https://modelslab.com';

/**
 * Create a ModelsLab provider instance.
 */
export function createModelslab(
  options: ModelslabProviderSettings = {},
): ModelslabProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);

  const createImageModel = (modelId: ModelslabImageModelId) =>
    new ModelslabImageModel(modelId, {
      provider: 'modelslab.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: options.headers,
      fetch: options.fetch,
      apiKey: options.apiKey,
    });

  return {
    imageModel: createImageModel,
    image: createImageModel,
    languageModel: (modelId: string) => {
      throw new NoSuchModelError({
        modelId,
        modelType: 'languageModel',
      });
    },
    textEmbeddingModel: (modelId: string) => {
      throw new NoSuchModelError({
        modelId,
        modelType: 'textEmbeddingModel',
      });
    },
  };
}

/**
 * Default ModelsLab provider instance.
 */
export const modelslab = createModelslab();
