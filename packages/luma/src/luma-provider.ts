import { ImageModelV2, NoSuchModelError, ProviderV2 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { LumaImageModel } from './luma-image-model';
import { LumaImageModelId } from './luma-image-settings';

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

export interface LumaProvider extends ProviderV2 {
  /**
Creates a model for image generation.
  */
  image(modelId: LumaImageModelId): ImageModelV2;

  /**
Creates a model for image generation.
   */
  imageModel(modelId: LumaImageModelId): ImageModelV2;
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

  const createImageModel = (modelId: LumaImageModelId) =>
    new LumaImageModel(modelId, {
      provider: 'luma.image',
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

export const luma = createLuma();
