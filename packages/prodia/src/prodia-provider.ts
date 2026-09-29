import {
  type LanguageModelV4,
  type ImageModelProviderV4,
  type VideoModelProviderV4,
  type EmbeddingModelProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  noSuchModel,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { ProdiaImageModel } from './prodia-image-model';
import type { ProdiaImageModelId } from './prodia-image-settings';
import { ProdiaLanguageModel } from './prodia-language-model';
import type { ProdiaLanguageModelId } from './prodia-language-model-settings';
import { ProdiaVideoModel } from './prodia-video-model';
import type { ProdiaVideoModelId } from './prodia-video-model-settings';
import { VERSION } from './version';

export interface ProdiaProviderSettings {
  /**
   * Prodia API key. Default value is taken from the `PRODIA_TOKEN` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls. Defaults to `https://inference.prodia.com/v2`.
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

export interface ProdiaProvider
  extends
    ImageModelProviderV4<ProdiaImageModelId>,
    VideoModelProviderV4<ProdiaVideoModelId>,
    EmbeddingModelProviderV4 {
  /**
   * Creates a language model for multimodal generation (img2img with text+image output).
   */
  languageModel(modelId: ProdiaLanguageModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

const defaultBaseURL = 'https://inference.prodia.com/v2';

export function createProdia(
  options: ProdiaProviderSettings = {},
): ProdiaProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'PRODIA_TOKEN',
          description: 'Prodia',
        })}`,
        ...options.headers,
      },
      `ai-sdk-prodia/${VERSION}`,
    );

  const createImageModel = (modelId: ProdiaImageModelId) =>
    new ProdiaImageModel(modelId, {
      provider: 'prodia.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createLanguageModel = (modelId: ProdiaLanguageModelId) =>
    new ProdiaLanguageModel(modelId, {
      provider: 'prodia.language',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createVideoModel = (modelId: ProdiaVideoModelId) =>
    new ProdiaVideoModel(modelId, {
      provider: 'prodia.video',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const embeddingModel = (modelId: string) =>
    noSuchModel(modelId, 'embeddingModel');

  return {
    specificationVersion: 'v4',
    languageModel: createLanguageModel,
    imageModel: createImageModel,
    image: createImageModel,
    videoModel: createVideoModel,
    video: createVideoModel,
    embedding: embeddingModel,
    embeddingModel,
    textEmbeddingModel: embeddingModel,
  };
}

export const prodia = createProdia();
