import {
  EmbeddingModelV1,
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { GoogleGenerativeAIEmbeddingModel } from './google-generative-ai-embedding-model';
import {
  GoogleGenerativeAIEmbeddingModelId,
  GoogleGenerativeAIEmbeddingSettings,
} from './google-generative-ai-embedding-settings';
import { GoogleGenerativeAILanguageModel } from './google-generative-ai-language-model';
import {
  GoogleGenerativeAIModelId,
  GoogleGenerativeAISettings,
} from './google-generative-ai-settings';
import { isSupportedFileUrl } from './google-supported-file-url';

export interface GoogleGenerativeAIProvider extends ProviderV2 {
  (
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ): LanguageModelV2;

  languageModel(
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ): LanguageModelV2;

  chat(
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ): LanguageModelV2;

  /**
   * @deprecated Use `chat()` instead.
   */
  generativeAI(
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ): LanguageModelV2;

  /**
@deprecated Use `textEmbeddingModel()` instead.
   */
  embedding(
    modelId: GoogleGenerativeAIEmbeddingModelId,
    settings?: GoogleGenerativeAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  /**
@deprecated Use `textEmbeddingModel()` instead.
 */
  textEmbedding(
    modelId: GoogleGenerativeAIEmbeddingModelId,
    settings?: GoogleGenerativeAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  textEmbeddingModel(
    modelId: GoogleGenerativeAIEmbeddingModelId,
    settings?: GoogleGenerativeAIEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

export interface GoogleGenerativeAIProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://generativelanguage.googleapis.com/v1beta`.
   */
  baseURL?: string;

  /**
API key that is being send using the `x-goog-api-key` header.
It defaults to the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string | undefined>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

  /**
Optional function to generate a unique ID for each request.
     */
  generateId?: () => string;
}

/**
Create a Google Generative AI provider instance.
 */
export function createGoogleGenerativeAI(
  options: GoogleGenerativeAIProviderSettings = {},
): GoogleGenerativeAIProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://generativelanguage.googleapis.com/v1beta';

  const getHeaders = () => ({
    'x-goog-api-key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'GOOGLE_GENERATIVE_AI_API_KEY',
      description: 'Google Generative AI',
    }),
    ...options.headers,
  });

  const createChatModel = (
    modelId: GoogleGenerativeAIModelId,
    settings: GoogleGenerativeAISettings = {},
  ) =>
    new GoogleGenerativeAILanguageModel(modelId, settings, {
      provider: 'google.generative-ai',
      baseURL,
      headers: getHeaders,
      generateId: options.generateId ?? generateId,
      isSupportedUrl: isSupportedFileUrl,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (
    modelId: GoogleGenerativeAIEmbeddingModelId,
    settings: GoogleGenerativeAIEmbeddingSettings = {},
  ) =>
    new GoogleGenerativeAIEmbeddingModel(modelId, settings, {
      provider: 'google.generative-ai',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Google Generative AI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.generativeAI = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

/**
Default Google Generative AI provider instance.
 */
export const google = createGoogleGenerativeAI();
