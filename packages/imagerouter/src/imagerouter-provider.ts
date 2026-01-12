import {
  ImageModelV3,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { ImageRouterImageModel } from './imagerouter-image-model';
import { ImageRouterImageModelId } from './imagerouter-image-settings';
import { VERSION } from './version';

export interface ImageRouterProviderSettings {
  /**
   * ImageRouter API key. Default value is taken from the `IMAGEROUTER_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   * The default prefix is `https://api.imagerouter.io`.
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

export interface ImageRouterProvider extends ProviderV3 {
  /**
   * Creates a model for image generation.
   */
  image(modelId: ImageRouterImageModelId): ImageModelV3;

  /**
   * Creates a model for image generation.
   */
  imageModel(modelId: ImageRouterImageModelId): ImageModelV3;
}

const defaultBaseURL = 'https://api.imagerouter.io';

function loadImageRouterApiKey({
  apiKey,
  description = 'ImageRouter.io',
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

  const envApiKey = process.env.IMAGEROUTER_API_KEY;

  if (envApiKey == null) {
    throw new Error(
      `${description} API key is missing. Pass it using the 'apiKey' parameter or set the IMAGEROUTER_API_KEY environment variable.`,
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
 * Create an ImageRouter provider instance.
 */
export function createImageRouter(
  options: ImageRouterProviderSettings = {},
): ImageRouterProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadImageRouterApiKey({
          apiKey: options.apiKey,
        })}`,
        ...options.headers,
      },
      `ai-sdk/imagerouter/${VERSION}`,
    );

  const createImageModel = (modelId: ImageRouterImageModelId) =>
    new ImageRouterImageModel(modelId, {
      provider: 'imagerouter.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  return {
    specificationVersion: 'v3' as const,
    imageModel: createImageModel,
    image: createImageModel,
    languageModel: (modelId: string) => {
      throw new NoSuchModelError({
        modelId,
        modelType: 'languageModel',
      });
    },
    embeddingModel: (modelId: string) => {
      throw new NoSuchModelError({
        modelId,
        modelType: 'embeddingModel',
      });
    },
    textEmbeddingModel: (modelId: string) => {
      throw new NoSuchModelError({
        modelId,
        modelType: 'embeddingModel',
      });
    },
  };
}

/**
 * Default ImageRouter provider instance.
 */
export const imagerouter = createImageRouter();
