import {
  type ImageModelV3,
  NoSuchModelError,
  type ProviderV3,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { DecartImageModel } from './decart-image-model';
import type { DecartImageModelId } from './decart-image-settings';
import { VERSION } from './version';

export interface DecartProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export interface DecartProvider extends ProviderV3 {
  image(modelId: DecartImageModelId): ImageModelV3;
  imageModel(modelId: DecartImageModelId): ImageModelV3;
}

const defaultBaseURL = 'https://api.decart.ai';

export function createDecart(
  options: DecartProviderSettings = {},
): DecartProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'X-API-KEY': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'DECART_API_KEY',
          description: 'Decart',
        }),
        ...options.headers,
      },
      `ai-sdk/decart/${VERSION}`,
    );

  const createImageModel = (modelId: DecartImageModelId) =>
    new DecartImageModel(modelId, {
      provider: 'decart.image',
      url: ({ path, modelId }) => `${baseURL}/${path}/${modelId}`,
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  return {
    image: createImageModel,
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
}

export const decart = createDecart();
