import { ImageModelV2, NoSuchModelError, ProviderV2 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { ModelsLabImageModel } from './modelslab-image-model';
import { ModelsLabImageModelId } from './modelslab-image-settings';

export interface ModelsLabProviderSettings {
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

export interface ModelsLabProvider extends ProviderV2 {
  /**
   * Creates a model for image generation.
   */
  image(modelId: ModelsLabImageModelId): ImageModelV2;
}

const defaultBaseURL = 'https://modelslab.com';

function loadModelsLabApiKey({
  apiKey,
  description = 'ModelsLab',
}: {
  apiKey: string | undefined;
  description?: string;
}): string {
  if (typeof apiKey === 'string') {
    return apiKey;
  }

  if (apiKey != null) {
    throw new Error(`${description} API key must be a string.`);
  }

  if (typeof process === 'undefined') {
    throw new Error(
      `${description} API key is missing. Pass it using the 'apiKey' parameter. Environment variables are not supported in this environment.`,
    );
  }

  const envApiKey = process.env.MODELSLAB_API_KEY;

  if (envApiKey == null) {
    throw new Error(
      `${description} API key is missing. Pass it using the 'apiKey' parameter or set the MODELSLAB_API_KEY environment variable.`,
    );
  }

  if (typeof envApiKey !== 'string') {
    throw new Error(
      `${description} API key must be a string. The value of the environment variable is not a string.`,
    );
  }

  // Allow test keys for development
  if (envApiKey.startsWith('test-') || envApiKey === '') {
    return envApiKey;
  }

  return envApiKey;
}

/**
 * Create a ModelsLab provider instance.
 */
export function createModelsLab(
  options: ModelsLabProviderSettings = {},
): ModelsLabProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const apiKey = loadModelsLabApiKey({
    apiKey: options.apiKey,
  });

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...options.headers,
  });

  const createImageModel = (modelId: ModelsLabImageModelId) =>
    new ModelsLabImageModel(modelId, {
      provider: 'modelslab.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = {
    imageModel: createImageModel,
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

  return {
    ...provider,
    image: createImageModel,
  };
}

/**
 * Default ModelsLab provider instance.
 */
export const modelslab = new Proxy({} as ModelsLabProvider, {
  get(target, prop) {
    const provider = createModelsLab();
    return provider[prop as keyof ModelsLabProvider];
  },
});
