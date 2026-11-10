import {
  NoSuchModelError,
  type Experimental_VideoModelV3,
  type ImageModelV3,
  type LanguageModelV3,
  type ProviderV3,
} from '@ai-sdk/provider';
import {
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { MiniMaxChatLanguageModel } from './minimax-chat-language-model';
import type { MiniMaxChatModelId } from './minimax-chat-language-model-options';
import { MiniMaxVideoModel } from './minimax-video-model';
import type { MiniMaxVideoModelId } from './minimax-video-settings';
import { MiniMaxImageModel } from './minimax-image-model';
import type { MiniMaxImageModelId } from './minimax-image-model-options';
import { VERSION } from './version';

export interface MiniMaxProviderSettings {
  /**
   * MiniMax API key. Default value is taken from the `MINIMAX_API_KEY`
   * environment variable.
   */
  apiKey?: string;
  /**
   * Base URL for the API calls. Defaults to MiniMax's Anthropic-compatible
   * endpoint (`https://api.minimax.io/anthropic/v1`).
   */
  baseURL?: string;
  /**
   * Use a different URL prefix for video generation API calls.
   * The default prefix is `https://api.minimax.io`.
   */
  videoBaseURL?: string;
  /** Image generation endpoint. Defaults to `https://api.minimax.io/v1`. */
  imageBaseURL?: string;
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

export interface MiniMaxProvider extends ProviderV3 {
  /** Creates a MiniMax image generation or editing model. */
  image(modelId: MiniMaxImageModelId): ImageModelV3;
  /** Creates a MiniMax image generation or editing model. */
  imageModel(modelId: MiniMaxImageModelId): ImageModelV3;
  /**
   * Creates a MiniMax model for text generation.
   */
  (modelId: MiniMaxChatModelId): LanguageModelV3;

  /**
   * Creates a MiniMax language model for text generation.
   */
  languageModel(modelId: MiniMaxChatModelId): LanguageModelV3;

  /**
   * Creates a MiniMax chat model for text generation.
   */
  chat(modelId: MiniMaxChatModelId): LanguageModelV3;

  /**
   * Creates a MiniMax video model for video generation.
   */
  video(modelId: MiniMaxVideoModelId): Experimental_VideoModelV3;

  /**
   * Creates a MiniMax video model for video generation.
   */
  videoModel(modelId: MiniMaxVideoModelId): Experimental_VideoModelV3;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

const defaultBaseURL = 'https://api.minimax.io/anthropic/v1';
const defaultVideoBaseURL = 'https://api.minimax.io';

export function createMiniMax(
  options: MiniMaxProviderSettings = {},
): MiniMaxProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? defaultBaseURL) ?? defaultBaseURL;

  const videoBaseURL =
    withoutTrailingSlash(options.videoBaseURL ?? defaultVideoBaseURL) ??
    defaultVideoBaseURL;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'anthropic-version': '2023-06-01',
        'x-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MINIMAX_API_KEY',
          description: 'MiniMax API key',
        }),
        ...options.headers,
      },
      `ai-sdk/minimax/${VERSION}`,
    );

  const createChatModel = (modelId: MiniMaxChatModelId) =>
    new MiniMaxChatLanguageModel(modelId, {
      provider: 'minimax.messages',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId,
      supportedUrls: () => ({}),
    });

  const getMediaHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MINIMAX_API_KEY',
          description: 'MiniMax API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/minimax/${VERSION}`,
    );

  const createVideoModel = (modelId: MiniMaxVideoModelId) =>
    new MiniMaxVideoModel(modelId, {
      provider: 'minimax.video',
      baseURL: videoBaseURL,
      headers: getMediaHeaders,
      fetch: options.fetch,
    });

  const createImageModel = (modelId: MiniMaxImageModelId) =>
    new MiniMaxImageModel(modelId, {
      provider: 'minimax.image',
      baseURL:
        withoutTrailingSlash(options.imageBaseURL) ??
        'https://api.minimax.io/v1',
      headers: getMediaHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: MiniMaxChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.video = createVideoModel;
  provider.videoModel = createVideoModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;

  return provider;
}

export const minimax = createMiniMax();
