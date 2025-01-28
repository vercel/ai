import type { FetchFunction } from '@ai-sdk/provider-utils';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { FalImageModel } from './fal-image-model';
import { FalImageModelId, FalImageSettings } from './fal-image-settings';

export interface FalProviderSettings {
  /**
   * API Key that is being send using the `Authorization` header.
   * It defaults to the `FAL_KEY` environment variable.
   *
   * Get yours at https://fal.ai/dashboard/keys
   */
  apiKey?: string;

  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers.
   * The default prefix is `https://fal.run`.
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

export interface FalProvider {
  /**
   * Creates a fal image generation model.
   */
  image(modelId: FalImageModelId, settings?: FalImageSettings): FalImageModel;
}

/**
 * Create a fal.ai provider instance.
 */
export function createFal(options: FalProviderSettings = {}): FalProvider {
  return {
    image: (modelId: FalImageModelId, settings?: FalImageSettings) =>
      new FalImageModel(modelId, settings ?? {}, {
        provider: 'fal',
        baseURL: options.baseURL ?? 'https://fal.run',
        headers: {
          Authorization: `Key ${loadApiKey({
            apiKey: options.apiKey,
            environmentVariableName: 'FAL_KEY',
            description: 'fal.ai API key',
          })}`,
          ...options.headers,
        },
        fetch: options.fetch,
      }),
  };
}

/**
 * Default fal.ai provider instance.
 */
export const fal = createFal();
