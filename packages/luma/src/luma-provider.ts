import {
  type ImageModelProviderV4,
  type EmbeddingModelProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  noSuchModel,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { LumaImageModel } from './luma-image-model';
import type { LumaImageModelId } from './luma-image-settings';
import { VERSION } from './version';

export interface LumaProviderSettings {
  /**
   * Luma API key. Default value is taken from the `LUMA_API_KEY` environment
   * variable.
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
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface LumaProvider
  extends ImageModelProviderV4<LumaImageModelId>, EmbeddingModelProviderV4 {
  languageModel(modelId: string): never;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

const defaultBaseURL = 'https://api.lumalabs.ai';

export function createLuma(options: LumaProviderSettings = {}): LumaProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'LUMA_API_KEY',
          description: 'Luma',
        })}`,
        ...options.headers,
      },
      `ai-sdk-luma/${VERSION}`,
    );

  const createImageModel = (modelId: LumaImageModelId) =>
    new LumaImageModel(modelId, {
      provider: 'luma.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const embeddingModel = (modelId: string) =>
    noSuchModel(modelId, 'embeddingModel');

  return {
    specificationVersion: 'v4' as const,
    image: createImageModel,
    imageModel: createImageModel,
    languageModel: (modelId: string) => noSuchModel(modelId, 'languageModel'),
    embeddingModel,
    embedding: embeddingModel,
    textEmbeddingModel: embeddingModel,
  };
}

export const luma = createLuma();
