import { ImageModelV1 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { LumaImageModel } from './luma-image-model';
import { LumaImageModelId, LumaImageSettings } from './luma-image-settings';

export interface LumaProviderSettings {
  /**
Luma API key. Default value is taken from the `LUMA_API_KEY` environment
variable.
  */
  apiKey?: string;
  /**
Base URL for the API calls.
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

export interface LumaProvider {
  /**
Creates a model for image generation.
  */
  image(modelId: LumaImageModelId, settings?: LumaImageSettings): ImageModelV1;
}

const defaultBaseURL = 'https://api.lumalabs.ai';

export function createLuma(options: LumaProviderSettings = {}): LumaProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'LUMA_API_KEY',
      description: 'Luma',
    })}`,
    ...options.headers,
  });

  const createImageModel = (
    modelId: LumaImageModelId,
    settings: LumaImageSettings = {},
  ) =>
    new LumaImageModel(modelId, settings, {
      provider: 'luma.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: LumaImageModelId, settings?: LumaImageSettings) =>
    createImageModel(modelId, settings);

  provider.image = createImageModel;

  return provider as LumaProvider;
}

export const luma = createLuma();
