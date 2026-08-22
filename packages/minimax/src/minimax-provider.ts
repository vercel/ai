import {
  NoSuchModelError,
  type Experimental_VideoModelV4,
  type ImageModelV4,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { AnthropicLanguageModel } from '@ai-sdk/anthropic/internal';
import type { MiniMaxChatModelId } from './minimax-chat-options';
import { MiniMaxImageModel } from './minimax-image-model';
import type { MiniMaxImageModelId } from './minimax-image-settings';
import { MiniMaxVideoModel } from './minimax-video-model';
import type { MiniMaxVideoModelId } from './minimax-video-settings';
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
  /**
   * Use a different URL prefix for image generation API calls.
   * The default prefix is `https://api.minimax.io`.
   */
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

export interface MiniMaxProvider extends ProviderV4 {
  /**
   * Creates a MiniMax model for text generation.
   */
  (modelId: MiniMaxChatModelId): LanguageModelV4;

  /**
   * Creates a MiniMax language model for text generation.
   */
  languageModel(modelId: MiniMaxChatModelId): LanguageModelV4;

  /**
   * Creates a MiniMax chat model for text generation.
   */
  chat(modelId: MiniMaxChatModelId): LanguageModelV4;

  /**
   * Creates a MiniMax image model for image generation.
   */
  image(modelId: MiniMaxImageModelId): ImageModelV4;

  /**
   * Creates a MiniMax image model for image generation.
   */
  imageModel(modelId: MiniMaxImageModelId): ImageModelV4;

  /**
   * Creates a MiniMax video model for video generation.
   */
  video(modelId: MiniMaxVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates a MiniMax video model for video generation.
   */
  videoModel(modelId: MiniMaxVideoModelId): Experimental_VideoModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

const defaultBaseURL = 'https://api.minimax.io/anthropic/v1';
const defaultNativeBaseURL = 'https://api.minimax.io';

export function createMiniMax(
  options: MiniMaxProviderSettings = {},
): MiniMaxProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? defaultBaseURL) ?? defaultBaseURL;

  const videoBaseURL =
    withoutTrailingSlash(options.videoBaseURL ?? defaultNativeBaseURL) ??
    defaultNativeBaseURL;

  const imageBaseURL =
    withoutTrailingSlash(options.imageBaseURL ?? defaultNativeBaseURL) ??
    defaultNativeBaseURL;

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
    new AnthropicLanguageModel(modelId, {
      provider: 'minimax.messages',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId,
      supportedUrls: () => ({}),
    });

  const getBearerTokenHeaders = () =>
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

  const createImageModel = (modelId: MiniMaxImageModelId) =>
    new MiniMaxImageModel(modelId, {
      provider: 'minimax.image',
      baseURL: imageBaseURL,
      headers: getBearerTokenHeaders,
      fetch: options.fetch,
    });

  const createVideoModel = (modelId: MiniMaxVideoModelId) =>
    new MiniMaxVideoModel(modelId, {
      provider: 'minimax.video',
      baseURL: videoBaseURL,
      headers: getBearerTokenHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: MiniMaxChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.video = createVideoModel;
  provider.videoModel = createVideoModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  return provider;
}

export const minimax = createMiniMax();
