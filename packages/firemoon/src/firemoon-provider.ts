import { NoSuchModelError, ProviderV3 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { loadApiKey, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { FiremoonImageModel } from './firemoon-image-model';
import { FiremoonImageModelId } from './firemoon-image-settings';
import { VERSION } from './version';

export interface FiremoonProviderSettings {
  /**
   * API key for Firemoon Studio API.
   * It defaults to the `FIREMOON_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Use a different URL prefix for API calls.
   * The default prefix is `https://firemoon.studio/api`.
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

export interface FiremoonProvider extends ProviderV3 {
  /**
   * Creates a Firemoon image generation model.
   */
  image(modelId: FiremoonImageModelId): FiremoonImageModel;

  /**
   * Creates a Firemoon image generation model.
   */
  imageModel(modelId: FiremoonImageModelId): FiremoonImageModel;
}

/**
 * Create a Firemoon provider instance.
 */
export function createFiremoon(
  options: FiremoonProviderSettings = {},
): FiremoonProvider {
  const createImageModel = (modelId: FiremoonImageModelId) =>
    new FiremoonImageModel(modelId, {
      provider: 'firemoon',
      baseURL: options.baseURL ?? 'https://firemoon.studio/api',
      headers: withUserAgentSuffix(
        {
          Authorization: `Bearer ${loadApiKey({
            apiKey: options.apiKey,
            environmentVariableName: 'FIREMOON_API_KEY',
            description: 'Firemoon Studio',
          })}`,
          ...options.headers,
        },
        `ai-sdk/firemoon/${VERSION}`,
      ),
      fetch: options.fetch,
    });

  return {
    specificationVersion: 'v3' as const,
    image: createImageModel,
    imageModel: createImageModel,
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
  };
}

/**
 * Default Firemoon provider instance.
 */
export const firemoon = createFiremoon();
