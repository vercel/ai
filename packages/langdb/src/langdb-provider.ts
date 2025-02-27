import {
  LanguageModelV1,
  EmbeddingModelV1,
  ProviderV1,
  ImageModelV1,
} from '@ai-sdk/provider';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { LangDBChatSettings, LangDBChatModelId } from './langdb-chat-settings';
import {
  LangDBImageSettings,
  LangDBImageModelId,
} from './langdb-image-settings';
import {
  LangDBEmbeddingSettings,
  LangDBEmbeddingModelId,
} from './langdb-embedding-settings';
import { LangDBImageModel } from './langdb-image-model';

export interface LangDBProviderSettings {
  /**
   * API key for authentication with LangDB.
   */
  apiKey?: string;

  /**
   * Base URL for the LangDB API.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch function to use for making requests.
   */
  fetch?: FetchFunction;

  /**
   * Project ID for LangDB.
   */
  projectId?: string;

  /**
   * Thread ID for LangDB.
   */
  threadId?: string;

  /**
   * Run ID for LangDB.
   */
  runId?: string;

  /**
   * Label for LangDB.
   */
  label?: string;
}

export interface LangDBProvider extends ProviderV1 {
  /**
   * Creates a model for text generation.
   */
  (modelId: LangDBChatModelId, settings?: LangDBChatSettings): LanguageModelV1;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(
    modelId: LangDBChatModelId,
    settings?: LangDBChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a chat model for text generation.
   */
  languageModel(
    modelId: LangDBChatModelId,
    settings?: LangDBChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a model for text embeddings.
   */
  textEmbeddingModel(
    modelId: LangDBEmbeddingModelId,
    settings?: LangDBEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  /**
   * Creates a model for image generation.
   */
  imageModel(
    modelId: LangDBImageModelId,
    settings?: LangDBImageSettings,
  ): ImageModelV1;
}

export function createLangDB(
  options: LangDBProviderSettings = {},
): LangDBProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.us-east-1.langdb.ai',
  );

  const getHeaders = () => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${loadApiKey({
        apiKey: options.apiKey,
        environmentVariableName: 'LANGDB_API_KEY',
        description: 'LangDB',
      })}`,
    };

    if (options.projectId) {
      headers['x-project-id'] = options.projectId;
    }

    if (options.threadId) {
      headers['x-thread-id'] = options.threadId;
    }

    if (options.runId) {
      headers['x-run-id'] = options.runId;
    }

    if (options.label) {
      headers['x-label'] = options.label;
    }

    return {
      ...headers,
      ...options.headers,
    };
  };

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `langdb.${modelType}`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (
    modelId: LangDBChatModelId,
    settings: LangDBChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...getCommonModelConfig('chat'),
      defaultObjectGenerationMode: 'tool',
    });
  };

  const createTextEmbeddingModel = (
    modelId: LangDBEmbeddingModelId,
    settings: LangDBEmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      settings,
      getCommonModelConfig('embedding'),
    );

  const createImageModel = (
    modelId: LangDBImageModelId,
    settings: LangDBImageSettings = {},
  ) =>
    new LangDBImageModel(modelId, settings, {
      provider: `langdb.image`,
      baseURL: baseURL ?? 'https://api.us-east-1.langdb.ai/v1',
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (
    modelId: LangDBChatModelId,
    settings?: LangDBChatSettings,
  ) => createChatModel(modelId, settings);

  provider.languageModel = createChatModel;
  provider.chatModel = createChatModel;
  provider.textEmbeddingModel = createTextEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  return provider;
}

export const LangDB = createLangDB();
