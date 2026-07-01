import {
  NoSuchModelError,
  type Experimental_VideoModelV4,
  type ImageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { MuApiImageModel } from './muapi-image-model';
import type { MuApiImageModelId } from './muapi-image-model';
import { MuApiVideoModel } from './muapi-video-model';
import type { MuApiVideoModelId } from './muapi-video-model';
import { VERSION } from './version';

const BASE_URL = 'https://api.muapi.ai/api/v1';

export interface MuApiProviderSettings {
  /**
   * MuAPI API key. Defaults to the `MUAPI_API_KEY` environment variable.
   * Get your key at https://muapi.ai/dashboard/api-keys
   */
  apiKey?: string;

  /**
   * Override the default base URL for MuAPI requests.
   */
  baseURL?: string;

  /**
   * Custom headers to include in all requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation for intercepting or mocking requests.
   */
  fetch?: FetchFunction;
}

export interface MuApiProvider extends ProviderV4 {
  /**
   * Creates a MuAPI text-to-image or image-to-image model.
   *
   * Model IDs: 'flux-schnell', 'flux-dev', 'hidream-fast', 'midjourney', 'imagen4', etc.
   *
   * See https://muapi.ai/docs for the full model list.
   */
  image(modelId: MuApiImageModelId): ImageModelV4;

  /**
   * Creates a MuAPI text-to-video model.
   *
   * Model IDs: 'veo3-fast', 'kling-master', 'wan2.2', 'seedance-pro', 'runway', etc.
   */
  video(modelId: MuApiVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates a MuAPI image-to-video model.
   *
   * Provide the source image via `options.image` or `providerOptions.muapi.image_url`.
   * Model IDs: 'kling-master', 'veo3', 'wan2.5-i2v', 'seedance-2', etc.
   */
  imageToVideo(modelId: MuApiVideoModelId): Experimental_VideoModelV4;
}

export function createMuapi(options: MuApiProviderSettings = {}): MuApiProvider {
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'x-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MUAPI_API_KEY',
          description: 'MuAPI',
        }),
        ...options.headers,
      },
      `ai-sdk/muapi/${VERSION}`,
    );

  const baseURL = options.baseURL ?? BASE_URL;

  const createImageModel = (modelId: MuApiImageModelId) =>
    new MuApiImageModel(modelId, {
      provider: 'muapi',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createVideoModel = (modelId: MuApiVideoModelId, mode: 'text-to-video' | 'image-to-video' = 'text-to-video') =>
    new MuApiVideoModel(modelId, {
      provider: mode === 'image-to-video' ? 'muapi.image-to-video' : 'muapi.video',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      mode,
    });

  const embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };

  return {
    specificationVersion: 'v4' as const,
    image: createImageModel,
    imageModel: createImageModel,
    languageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },
    embeddingModel,
    textEmbeddingModel: embeddingModel,
    video: (modelId: MuApiVideoModelId) => createVideoModel(modelId, 'text-to-video'),
    videoModel: (modelId: MuApiVideoModelId) => createVideoModel(modelId, 'text-to-video'),
    imageToVideo: (modelId: MuApiVideoModelId) => createVideoModel(modelId, 'image-to-video'),
  };
}

/**
 * Default MuAPI provider instance. Reads `MUAPI_API_KEY` from the environment.
 */
export const muapi = createMuapi();
