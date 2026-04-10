import { ImageModelV4, NoSuchModelError, ProviderV4 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { PhotaImageModel } from './phota-image-model';
import { PhotaImageModelId } from './phota-image-settings';
import { VERSION } from './version';

export interface PhotaProviderSettings {
  /**
   * Phota API key. Default value is taken from the `PHOTA_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls. Defaults to `https://api.photalabs.com/v1/phota`.
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

export interface PhotaProvider extends ProviderV4 {
  /**
   * Creates a model for image operations.
   *
   * Model IDs:
   * - `generate` — text-to-image generation
   * - `edit` — edit existing images with a prompt
   * - `enhance` — automatic image enhancement
   * - `train` — create a profile from reference images (returns profileId in providerMetadata)
   * - `status` — poll profile training status (pass profileId in providerOptions)
   */
  image(modelId: PhotaImageModelId): ImageModelV4;

  /**
   * Creates a model for image operations.
   */
  imageModel(modelId: PhotaImageModelId): ImageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

const defaultBaseURL = 'https://api.photalabs.com/v1/phota';

export function createPhota(
  options: PhotaProviderSettings = {},
): PhotaProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'X-API-Key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'PHOTA_API_KEY',
          description: 'Phota',
        }),
        ...options.headers,
      },
      `ai-sdk/phota/${VERSION}`,
    );

  const createImageModel = (modelId: PhotaImageModelId) =>
    new PhotaImageModel(modelId, {
      provider: 'phota.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
    });
  };

  return {
    specificationVersion: 'v4',
    imageModel: createImageModel,
    image: createImageModel,
    languageModel: (modelId: string) => {
      throw new NoSuchModelError({
        modelId,
        modelType: 'languageModel',
      });
    },
    embeddingModel,
    textEmbeddingModel: embeddingModel,
  };
}

export const phota = createPhota();
