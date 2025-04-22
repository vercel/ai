import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleImageModel,
  ProviderErrorStructure,
} from '@ai-sdk/openai-compatible';
import {
  ImageModelV1,
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { XaiChatModelId, supportsStructuredOutputs } from './xai-chat-settings';
import { XaiErrorData, xaiErrorSchema } from './xai-error';
import { XaiImageModelId, XaiImageSettings } from './xai-image-settings';

const xaiErrorStructure: ProviderErrorStructure<XaiErrorData> = {
  errorSchema: xaiErrorSchema,
  errorToMessage: data => data.error,
};

export interface XaiProvider extends ProviderV2 {
  /**
Creates an Xai chat model for text generation.
   */
  (modelId: XaiChatModelId): LanguageModelV2;

  /**
Creates an Xai language model for text generation.
   */
  languageModel(modelId: XaiChatModelId): LanguageModelV2;

  /**
Creates an Xai chat model for text generation.
   */
  chat: (modelId: XaiChatModelId) => LanguageModelV2;

  /**
Creates an Xai image model for image generation.
   */
  image(modelId: XaiImageModelId, settings?: XaiImageSettings): ImageModelV1;

  /**
Creates an Xai image model for image generation.
   */
  imageModel(
    modelId: XaiImageModelId,
    settings?: XaiImageSettings,
  ): ImageModelV1;
}

export interface XaiProviderSettings {
  /**
Base URL for the xAI API calls.
     */
  baseURL?: string;

  /**
API key for authenticating requests.
   */
  apiKey?: string;

  /**
Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
  */
  fetch?: FetchFunction;
}

export function createXai(options: XaiProviderSettings = {}): XaiProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.x.ai/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'XAI_API_KEY',
      description: 'xAI API key',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (modelId: XaiChatModelId) => {
    const structuredOutputs = supportsStructuredOutputs(modelId);
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: 'xai.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: xaiErrorStructure,
      supportsStructuredOutputs: structuredOutputs,
    });
  };

  const createImageModel = (
    modelId: XaiImageModelId,
    settings: XaiImageSettings = {},
  ) => {
    return new OpenAICompatibleImageModel(modelId, settings, {
      provider: 'xai.image',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: xaiErrorStructure,
    });
  };

  const provider = (modelId: XaiChatModelId) => createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = createImageModel;
  provider.image = createImageModel;

  return provider;
}

export const xai = createXai();
