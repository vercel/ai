import {
  EmbeddingModelV1,
  ImageModelV1,
  LanguageModelV1,
  ProviderV1,
} from '@ai-sdk/provider';
import { FetchFunction, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from './openai-compatible-chat-language-model';
import { OpenAICompatibleChatSettings } from './openai-compatible-chat-settings';
import { OpenAICompatibleCompletionLanguageModel } from './openai-compatible-completion-language-model';
import { OpenAICompatibleCompletionSettings } from './openai-compatible-completion-settings';
import { OpenAICompatibleEmbeddingModel } from './openai-compatible-embedding-model';
import { OpenAICompatibleEmbeddingSettings } from './openai-compatible-embedding-settings';
import { OpenAICompatibleImageSettings } from './openai-compatible-image-settings';
import { OpenAICompatibleImageModel } from './openai-compatible-image-model';

export interface OpenAICompatibleProvider<
  CHAT_MODEL_IDS extends string = string,
  COMPLETION_MODEL_IDS extends string = string,
  EMBEDDING_MODEL_IDS extends string = string,
  IMAGE_MODEL_IDS extends string = string,
> extends Omit<ProviderV1, 'imageModel'> {
  (
    modelId: CHAT_MODEL_IDS,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  languageModel(
    modelId: CHAT_MODEL_IDS,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  chatModel(
    modelId: CHAT_MODEL_IDS,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  completionModel(
    modelId: COMPLETION_MODEL_IDS,
    settings?: OpenAICompatibleCompletionSettings,
  ): LanguageModelV1;

  textEmbeddingModel(
    modelId: EMBEDDING_MODEL_IDS,
    settings?: OpenAICompatibleEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  imageModel(
    modelId: IMAGE_MODEL_IDS,
    settings?: OpenAICompatibleImageSettings,
  ): ImageModelV1;
}

export interface OpenAICompatibleProviderSettings {
  /**
Base URL for the API calls.
   */
  baseURL: string;

  /**
Provider name.
   */
  name: string;

  /**
API key for authenticating requests. If specified, adds an `Authorization`
header to request headers with the value `Bearer <apiKey>`. This will be added
before any headers potentially specified in the `headers` option.
   */
  apiKey?: string;

  /**
Optional custom headers to include in requests. These will be added to request headers
after any headers potentially added by use of the `apiKey` option.
   */
  headers?: Record<string, string>;

  /**
Optional custom url query parameters to include in request urls.
   */
  queryParams?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
Create an OpenAICompatible provider instance.
 */
export function createOpenAICompatible<
  CHAT_MODEL_IDS extends string,
  COMPLETION_MODEL_IDS extends string,
  EMBEDDING_MODEL_IDS extends string,
  IMAGE_MODEL_IDS extends string,
>(
  options: OpenAICompatibleProviderSettings,
): OpenAICompatibleProvider<
  CHAT_MODEL_IDS,
  COMPLETION_MODEL_IDS,
  EMBEDDING_MODEL_IDS,
  IMAGE_MODEL_IDS
> {
  const baseURL = withoutTrailingSlash(options.baseURL);
  const providerName = options.name;

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getHeaders = () => ({
    ...(options.apiKey && { Authorization: `Bearer ${options.apiKey}` }),
    ...options.headers,
  });

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `${providerName}.${modelType}`,
    url: ({ path }) => {
      const url = new URL(`${baseURL}${path}`);
      if (options.queryParams) {
        url.search = new URLSearchParams(options.queryParams).toString();
      }
      return url.toString();
    },
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createLanguageModel = (
    modelId: CHAT_MODEL_IDS,
    settings: OpenAICompatibleChatSettings = {},
  ) => createChatModel(modelId, settings);

  const createChatModel = (
    modelId: CHAT_MODEL_IDS,
    settings: OpenAICompatibleChatSettings = {},
  ) =>
    new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...getCommonModelConfig('chat'),
      defaultObjectGenerationMode: 'tool',
    });

  const createCompletionModel = (
    modelId: COMPLETION_MODEL_IDS,
    settings: OpenAICompatibleCompletionSettings = {},
  ) =>
    new OpenAICompatibleCompletionLanguageModel(
      modelId,
      settings,
      getCommonModelConfig('completion'),
    );

  const createEmbeddingModel = (
    modelId: EMBEDDING_MODEL_IDS,
    settings: OpenAICompatibleEmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      settings,
      getCommonModelConfig('embedding'),
    );

  const createImageModel = (
    modelId: IMAGE_MODEL_IDS,
    settings: OpenAICompatibleImageSettings = {},
  ) =>
    new OpenAICompatibleImageModel(
      modelId,
      settings,
      getCommonModelConfig('image'),
    );

  const provider = (
    modelId: CHAT_MODEL_IDS,
    settings?: OpenAICompatibleChatSettings,
  ) => createLanguageModel(modelId, settings);

  provider.languageModel = createLanguageModel;
  provider.chatModel = createChatModel;
  provider.completionModel = createCompletionModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.imageModel = createImageModel;

  return provider as OpenAICompatibleProvider<
    CHAT_MODEL_IDS,
    COMPLETION_MODEL_IDS,
    EMBEDDING_MODEL_IDS,
    IMAGE_MODEL_IDS
  >;
}
