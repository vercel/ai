import {
  NoSuchModelError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type ImageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { TopazImageModel } from './topaz-image-model';
import type { TopazImageModelId } from './topaz-image-settings';
import { TopazVideoModel } from './topaz-video-model';
import type { TopazVideoModelId } from './topaz-video-settings';
import { VERSION } from './version';

export interface TopazProviderSettings {
  /**
   * Topaz Labs API key. Default value is taken from the `TOPAZ_API_KEY`
   * environment variable.
   *
   * @see https://developer.topazlabs.com/getting-started/api-key-setup
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
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

export interface TopazProvider extends ProviderV4 {
  /**
   * Creates a model for image enhancement.
   */
  image(modelId: TopazImageModelId): ImageModelV4;

  /**
   * Creates a model for image enhancement.
   */
  imageModel(modelId: TopazImageModelId): ImageModelV4;

  /**
   * Creates a model for video enhancement.
   */
  video(modelId: TopazVideoModelId): VideoModelV4;

  /**
   * Creates a model for video enhancement.
   */
  videoModel(modelId: TopazVideoModelId): VideoModelV4;
}

const defaultBaseURL = 'https://api.topazlabs.com';

/**
 * Create a Topaz Labs provider instance.
 */
export function createTopaz(
  options: TopazProviderSettings = {},
): TopazProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? defaultBaseURL) ?? defaultBaseURL;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'X-API-Key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'TOPAZ_API_KEY',
          description: 'Topaz Labs',
        }),
        accept: 'application/json',
        ...options.headers,
      },
      `ai-sdk/topaz/${VERSION}`,
    );

  const createImageModel = (modelId: TopazImageModelId): ImageModelV4 =>
    new TopazImageModel(modelId, {
      provider: 'topaz.image',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createVideoModel = (modelId: TopazVideoModelId): VideoModelV4 =>
    new TopazVideoModel(modelId, {
      provider: 'topaz.video',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const noSuchModel = (
    modelId: string,
    modelType:
      | 'languageModel'
      | 'embeddingModel'
      | 'transcriptionModel'
      | 'speechModel'
      | 'rerankingModel',
  ): never => {
    throw new NoSuchModelError({ modelId, modelType });
  };

  const provider: TopazProvider = {
    specificationVersion: 'v4' as const,
    image: createImageModel,
    imageModel: createImageModel,
    video: createVideoModel,
    videoModel: createVideoModel,
    languageModel: (modelId: string) => noSuchModel(modelId, 'languageModel'),
    embeddingModel: (modelId: string) => noSuchModel(modelId, 'embeddingModel'),
  };

  return provider;
}

/**
 * Default Topaz Labs provider instance.
 */
export const topaz = createTopaz();
