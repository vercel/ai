import {
  EmbeddingModelV2,
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
import { GoogleGenerativeAIEmbeddingModelId } from './google-generative-ai-embedding-options';
import { GoogleGenerativeAILanguageModel } from './google-generative-ai-language-model';
import { GoogleGenerativeAIModelId } from './google-generative-ai-options';

export interface GoogleGenerativeAIProvider extends ProviderV2 {
  (modelId: GoogleGenerativeAIModelId): LanguageModelV2;

  languageModel(modelId: GoogleGenerativeAIModelId): LanguageModelV2;

  chat(modelId: GoogleGenerativeAIModelId): LanguageModelV2;

  /**
   * @deprecated Use `chat()` instead.
   */
  generativeAI(modelId: GoogleGenerativeAIModelId): LanguageModelV2;

  /**
@deprecated Use `textEmbeddingModel()` instead.
   */
  embedding(
    modelId: GoogleGenerativeAIEmbeddingModelId,
  ): EmbeddingModelV2<string>;

  /**
@deprecated Use `textEmbeddingModel()` instead.
 */
  textEmbedding(
    modelId: GoogleGenerativeAIEmbeddingModelId,
  ): EmbeddingModelV2<string>;

  textEmbeddingModel(
    modelId: GoogleGenerativeAIEmbeddingModelId,
  ): EmbeddingModelV2<string>;
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

  const createChatModel = (modelId: GoogleGenerativeAIModelId) =>
    new GoogleGenerativeAILanguageModel(modelId, {
      provider: 'google.generative-ai',
      baseURL,
      headers: getHeaders,
      generateId: options.generateId ?? generateId,
      supportedUrls: () => ({
        '*': [
          // Only allow requests to the Google Generative Language "files" endpoint
          // e.g. https://generativelanguage.googleapis.com/v1beta/files/...
          new RegExp(`^${baseURL}/files/.*$`),
        ],
      }),
      fetch: options.fetch,
    });

  const createEmbeddingModel = (modelId: GoogleGenerativeAIEmbeddingModelId) =>
    new GoogleGenerativeAIEmbeddingModel(modelId, {
      provider: 'google.generative-ai',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: GoogleGenerativeAIModelId) {
    if (new.target) {
      throw new Error(
        'The Google Generative AI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
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
