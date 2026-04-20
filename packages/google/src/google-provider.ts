import type {
  EmbeddingModelV4,
  Experimental_VideoModelV4,
  FilesV4,
  ImageModelV4,
  LanguageModelV4,
  ProviderV4,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { VERSION } from './version';
import { GoogleEmbeddingModel } from './google-embedding-model';
import { GoogleEmbeddingModelId } from './google-embedding-options';
import { GoogleLanguageModel } from './google-language-model';
import { GoogleModelId } from './google-options';
import { googleTools } from './google-tools';

import {
  GoogleImageSettings,
  GoogleImageModelId,
} from './google-image-settings';
import { GoogleImageModel } from './google-image-model';
import { GoogleFiles } from './google-files';
import { GoogleVideoModel } from './google-video-model';
import { GoogleVideoModelId } from './google-video-settings';

export interface GoogleProvider extends ProviderV4 {
  (modelId: GoogleModelId): LanguageModelV4;

  languageModel(modelId: GoogleModelId): LanguageModelV4;

  chat(modelId: GoogleModelId): LanguageModelV4;

  /**
   * Creates a model for image generation.
   */
  image(
    modelId: GoogleImageModelId,
    settings?: GoogleImageSettings,
  ): ImageModelV4;

  /**
   * @deprecated Use `chat()` instead.
   */
  generativeAI(modelId: GoogleModelId): LanguageModelV4;

  /**
   * Creates a model for text embeddings.
   */
  embedding(modelId: GoogleEmbeddingModelId): EmbeddingModelV4;

  /**
   * Creates a model for text embeddings.
   */
  embeddingModel(modelId: GoogleEmbeddingModelId): EmbeddingModelV4;

  /**
   * @deprecated Use `embedding` instead.
   */
  textEmbedding(modelId: GoogleEmbeddingModelId): EmbeddingModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: GoogleEmbeddingModelId): EmbeddingModelV4;

  /**
   * Creates a model for video generation.
   */
  video(modelId: GoogleVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates a model for video generation.
   */
  videoModel(modelId: GoogleVideoModelId): Experimental_VideoModelV4;

  files(): FilesV4;

  tools: typeof googleTools;
}

export interface GoogleProviderSettings {
  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers.
   * The default prefix is `https://generativelanguage.googleapis.com/v1beta`.
   */
  baseURL?: string;

  /**
   * API key that is being send using the `x-goog-api-key` header.
   * It defaults to the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string | undefined>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  /**
   * Optional function to generate a unique ID for each request.
   */
  generateId?: () => string;

  /**
   * Custom provider name
   * Defaults to 'google.generative-ai'.
   */
  name?: string;
}

/**
 * Create a Google provider instance.
 */
export function createGoogle(
  options: GoogleProviderSettings = {},
): GoogleProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://generativelanguage.googleapis.com/v1beta';

  const providerName = options.name ?? 'google.generative-ai';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'x-goog-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'GOOGLE_GENERATIVE_AI_API_KEY',
          description: 'Google Generative AI',
        }),
        ...options.headers,
      },
      `ai-sdk/google/${VERSION}`,
    );

  const createChatModel = (modelId: GoogleModelId) =>
    new GoogleLanguageModel(modelId, {
      provider: providerName,
      baseURL,
      headers: getHeaders,
      generateId: options.generateId ?? generateId,
      supportedUrls: () => ({
        '*': [
          // Google Generative Language "files" endpoint
          // e.g. https://generativelanguage.googleapis.com/v1beta/files/...
          new RegExp(`^${baseURL}/files/.*$`),
          // YouTube URLs (public or unlisted videos)
          new RegExp(
            `^https://(?:www\\.)?youtube\\.com/watch\\?v=[\\w-]+(?:&[\\w=&.-]*)?$`,
          ),
          new RegExp(`^https://youtu\\.be/[\\w-]+(?:\\?[\\w=&.-]*)?$`),
        ],
      }),
      fetch: options.fetch,
    });

  const createEmbeddingModel = (modelId: GoogleEmbeddingModelId) =>
    new GoogleEmbeddingModel(modelId, {
      provider: providerName,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createImageModel = (
    modelId: GoogleImageModelId,
    settings: GoogleImageSettings = {},
  ) =>
    new GoogleImageModel(modelId, settings, {
      provider: providerName,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createFiles = () =>
    new GoogleFiles({
      provider: providerName,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createVideoModel = (modelId: GoogleVideoModelId) =>
    new GoogleVideoModel(modelId, {
      provider: providerName,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: options.generateId ?? generateId,
    });

  const provider = function (modelId: GoogleModelId) {
    if (new.target) {
      throw new Error(
        'The Google Generative AI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.generativeAI = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.video = createVideoModel;
  provider.videoModel = createVideoModel;
  provider.files = createFiles;
  provider.tools = googleTools;

  return provider as GoogleProvider;
}

/**
 * Default Google Generative AI provider instance.
 */
export const google = createGoogle();
