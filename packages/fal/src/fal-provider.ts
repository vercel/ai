import { ImageModelV1, NoSuchModelError, ProviderV1 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { FalImageModel } from './fal-image-model';
import { FalImageModelId, FalImageSettings } from './fal-image-settings';

export interface FalProviderSettings {
  /**
fal.ai API key. Default value is taken from the `FAL_API_KEY` environment
variable, falling back to `FAL_KEY`.
  */
  apiKey?: string;

  /**
Base URL for the API calls.
The default prefix is `https://fal.run`.
   */
  baseURL?: string;

  /**
Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept
requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface FalProvider extends ProviderV1 {
  /**
Creates a model for image generation.
   */
  image(modelId: FalImageModelId, settings?: FalImageSettings): ImageModelV1;

  /**
Creates a model for image generation.
   */
  imageModel(
    modelId: FalImageModelId,
    settings?: FalImageSettings,
  ): ImageModelV1;
}

const defaultBaseURL = 'https://fal.run';

function loadFalApiKey({
  apiKey,
  description = 'fal.ai',
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

  let envApiKey = process.env.FAL_API_KEY;
  if (envApiKey == null) {
    envApiKey = process.env.FAL_KEY;
  }

  if (envApiKey == null) {
    throw new Error(
      `${description} API key is missing. Pass it using the 'apiKey' parameter or set either the FAL_API_KEY or FAL_KEY environment variable.`,
    );
  }

  if (typeof envApiKey !== 'string') {
    throw new Error(
      `${description} API key must be a string. The value of the environment variable is not a string.`,
    );
  }

  return envApiKey;
}

/**
Create a fal.ai provider instance.
 */
export function createFal(options: FalProviderSettings = {}): FalProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () => ({
    Authorization: `Key ${loadFalApiKey({
      apiKey: options.apiKey,
    })}`,
    ...options.headers,
  });

  const createImageModel = (
    modelId: FalImageModelId,
    settings: FalImageSettings = {},
  ) =>
    new FalImageModel(modelId, settings, {
      provider: 'fal.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  return {
    image: createImageModel,
    imageModel: createImageModel,
    languageModel: () => {
      throw new NoSuchModelError({
        modelId: 'languageModel',
        modelType: 'languageModel',
      });
    },
    textEmbeddingModel: () => {
      throw new NoSuchModelError({
        modelId: 'textEmbeddingModel',
        modelType: 'textEmbeddingModel',
      });
    },
  };
}

/**
Default fal.ai provider instance.
 */
export const fal = createFal();
