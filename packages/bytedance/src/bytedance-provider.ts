import {
  type Experimental_VideoModelV3,
  NoSuchModelError,
  type ProviderV3,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { ByteDanceVideoModel } from './bytedance-video-model';
import type { ByteDanceVideoModelId } from './bytedance-video-settings';

export interface ByteDanceProviderSettings {
  /**
   * ByteDance Ark API key. Default value is taken from the `ARK_API_KEY`
   * environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   * Default: https://ark.ap-southeast.bytepluses.com/api/v3
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

export interface ByteDanceProvider extends ProviderV3 {
  /**
   * Creates a model for video generation.
   */
  video(modelId: ByteDanceVideoModelId): Experimental_VideoModelV3;

  /**
   * Creates a model for video generation.
   */
  videoModel(modelId: ByteDanceVideoModelId): Experimental_VideoModelV3;
}

const defaultBaseURL = 'https://ark.ap-southeast.bytepluses.com/api/v3';

/**
 * Create a ByteDance provider instance.
 */
export function createByteDance(
  options: ByteDanceProviderSettings = {},
): ByteDanceProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'ARK_API_KEY',
      description: 'ByteDance ModelArk',
    })}`,
    'Content-Type': 'application/json',
    ...options.headers,
  });

  const createVideoModel = (modelId: ByteDanceVideoModelId) =>
    new ByteDanceVideoModel(modelId, {
      provider: 'bytedance.video',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  return {
    specificationVersion: 'v3' as const,
    embeddingModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
    languageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },
    video: createVideoModel,
    videoModel: createVideoModel,
  };
}

/**
 * Default ByteDance provider instance.
 */
export const byteDance = createByteDance();
