import { NoSuchModelError, ProviderV2 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { ReplicateImageModel } from './replicate-image-model';
import { ReplicateImageModelId } from './replicate-image-settings';

export interface ReplicateProviderSettings {
  /**
API token that is being send using the `Authorization` header.
It defaults to the `REPLICATE_API_TOKEN` environment variable.
   */
  apiToken?: string;

  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.replicate.com/v1`.
   */
  baseURL?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
}

export interface ReplicateProvider extends ProviderV2 {
  /**
   * Creates a Replicate image generation model.
   */
  image(modelId: ReplicateImageModelId): ReplicateImageModel;

  /**
   * Creates a Replicate image generation model.
   */
  imageModel(modelId: ReplicateImageModelId): ReplicateImageModel;
}

/**
 * Create a Replicate provider instance.
 */
export function createReplicate(
  options: ReplicateProviderSettings = {},
): ReplicateProvider {
  const createImageModel = (modelId: ReplicateImageModelId) =>
    new ReplicateImageModel(modelId, {
      provider: 'replicate',
      baseURL: options.baseURL ?? 'https://api.replicate.com/v1',
      headers: {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiToken,
          environmentVariableName: 'REPLICATE_API_TOKEN',
          description: 'Replicate',
        })}`,
        ...options.headers,
      },
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
 * Default Replicate provider instance.
 */
export const replicate = createReplicate();
