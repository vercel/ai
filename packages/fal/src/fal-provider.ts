import type { FetchFunction } from '@ai-sdk/provider-utils';
import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { FalImageModel } from './fal-image-model';
import { FalImageModelId, FalImageSettings } from './fal-image-settings';

export interface FalProviderSettings {
  /**
fal.ai API key. Default value is taken from the `FAL_API_KEY` environment
variable.
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

export interface FalProvider {
  /**
Creates a model for image generation.
   */
  image(modelId: FalImageModelId, settings?: FalImageSettings): FalImageModel;
}

const defaultBaseURL = 'https://fal.run';

/**
Create a fal.ai provider instance.
 */
export function createFal(options: FalProviderSettings = {}): FalProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () => ({
    Authorization: `Key ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'FAL_API_KEY',
      description: 'fal.ai',
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

  const provider = (modelId: FalImageModelId, settings?: FalImageSettings) =>
    createImageModel(modelId, settings);

  provider.image = createImageModel;

  return provider as FalProvider;
}

/**
Default fal.ai provider instance.
 */
export const fal = createFal();
