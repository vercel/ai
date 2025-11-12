import {
  ImageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { BlackForestLabsImageModel } from './bfl-image-model';
import { BlackForestLabsImageModelId } from './bfl-image-settings';
import { VERSION } from './version';

export interface BlackForestLabsProviderSettings {
  /**
BFL API key. Default value is taken from the `BFL_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
Base URL for the API calls. Defaults to `https://api.bfl.ai/v1`. 
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

export interface BlackForestLabsProvider extends ProviderV2 {
  /**
Creates a model for image generation.
   */
  image(modelId: BlackForestLabsImageModelId): ImageModelV2;

  /**
Creates a model for image generation.
   */
  imageModel(modelId: BlackForestLabsImageModelId): ImageModelV2;
}

const defaultBaseURL = 'https://api.bfl.ai/v1';

export function createBlackForestLabs(
  options: BlackForestLabsProviderSettings = {},
): BlackForestLabsProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'x-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'BFL_API_KEY',
          description: 'Black Forest Labs (BFL)',
        }),
        ...options.headers,
      },
      `ai-sdk/black-forest-labs/${VERSION}`,
    );

  const createImageModel = (modelId: BlackForestLabsImageModelId) =>
    new BlackForestLabsImageModel(modelId, {
      provider: 'black-forest-labs.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  return {
    imageModel: createImageModel,
    image: createImageModel,
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

export const blackForestLabs = createBlackForestLabs();
