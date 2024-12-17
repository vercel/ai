import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from '@ai-sdk/provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { XaiChatModelId, XaiChatSettings } from './xai-chat-settings';
import { z } from 'zod';
import { ProviderErrorStructure } from '@ai-sdk/openai-compatible';

// Add error schema and structure
const xaiErrorSchema = z.object({
  code: z.string(),
  error: z.string(),
});

export type XaiErrorData = z.infer<typeof xaiErrorSchema>;

const xaiErrorStructure: ProviderErrorStructure<XaiErrorData> = {
  errorSchema: xaiErrorSchema,
  errorToMessage: data => data.error,
};

export interface XaiProvider extends ProviderV1 {
  /**
Creates an Xai chat model for text generation.
   */
  (modelId: XaiChatModelId, settings?: XaiChatSettings): LanguageModelV1;

  /**
Creates an Xai language model for text generation.
   */
  languageModel(
    modelId: XaiChatModelId,
    settings?: XaiChatSettings,
  ): LanguageModelV1;

  /**
Creates an Xai chat model for text generation.
   */
  chat: (
    modelId: XaiChatModelId,
    settings?: XaiChatSettings,
  ) => LanguageModelV1;
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

  const createLanguageModel = (
    modelId: XaiChatModelId,
    settings: XaiChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      provider: 'xai.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      defaultObjectGenerationMode: 'tool',
      errorStructure: xaiErrorStructure,
    });
  };

  const provider = (modelId: XaiChatModelId, settings?: XaiChatSettings) =>
    createLanguageModel(modelId, settings);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider as XaiProvider;
}

export const xai = createXai();
