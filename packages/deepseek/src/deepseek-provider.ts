import {
  type FilesV4,
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type { DeepSeekChatModelId } from './chat/deepseek-chat-language-model-options';
import { DeepSeekChatLanguageModel } from './chat/deepseek-chat-language-model';
import { DeepSeekFiles } from './files/deepseek-files';
import type { DeepSeekResponsesModelId } from './responses/deepseek-responses-language-model-options';
import { DeepSeekResponsesLanguageModel } from './responses/deepseek-responses-language-model';
import { deepseekTools } from './tool';
import { VERSION } from './version';

export interface DeepSeekProviderSettings {
  /**
   * DeepSeek API key.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   */
  baseURL?: string;

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

export interface DeepSeekProvider extends ProviderV4 {
  /**
   * Creates a DeepSeek model for text generation, using the Chat Completions
   * API.
   */
  (modelId: DeepSeekChatModelId): LanguageModelV4;

  /**
   * Creates a DeepSeek model for text generation, using the Chat Completions
   * API.
   */
  languageModel(modelId: DeepSeekChatModelId): LanguageModelV4;

  /**
   * Creates a DeepSeek model for text generation, using the Chat Completions
   * API.
   */
  chat(modelId: DeepSeekChatModelId): LanguageModelV4;

  /**
   * Creates a DeepSeek files interface for uploading images.
   */
  files(): FilesV4;

  /**
   * Creates a DeepSeek model for text generation, using the Responses API.
   * It is the only DeepSeek API that supports the server-side tools in
   * `deepSeek.tools`.
   */
  responses(modelId: DeepSeekResponsesModelId): LanguageModelV4;

  /**
   * Tools that DeepSeek executes on its own servers. Only supported by the
   * Responses API models created with `deepSeek.responses()`.
   */
  tools: typeof deepseekTools;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export function createDeepSeek(
  options: DeepSeekProviderSettings = {},
): DeepSeekProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? 'https://api.deepseek.com') ??
    'https://api.deepseek.com';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'DEEPSEEK_API_KEY',
          description: 'DeepSeek API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/deepseek/${VERSION}`,
    );

  const createChatModel = (modelId: DeepSeekChatModelId) =>
    new DeepSeekChatLanguageModel(modelId, {
      provider: `deepseek.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createResponsesModel = (modelId: DeepSeekResponsesModelId) =>
    new DeepSeekResponsesLanguageModel(modelId, {
      provider: `deepseek.responses`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createFiles = () =>
    new DeepSeekFiles({
      provider: 'deepseek.files',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: DeepSeekChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.files = createFiles;
  provider.responses = createResponsesModel;
  provider.tools = deepseekTools;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const deepSeek = createDeepSeek();
