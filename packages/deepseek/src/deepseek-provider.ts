import {
  NoSuchModelError,
  type LanguageModelV3,
  type ProviderV3,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type { DeepSeekChatModelId } from './chat/deepseek-chat-options';
import { DeepSeekChatLanguageModel } from './chat/deepseek-chat-language-model';
<<<<<<< HEAD
=======
import { DeepSeekFiles } from './files/deepseek-files';
import { DeepSeekResponsesLanguageModel } from './responses/deepseek-responses-language-model';
import type { DeepSeekResponsesModelId } from './responses/deepseek-responses-language-model-options';
import { deepseekTools } from './tool';
>>>>>>> f9d43bdaa7 (feat(provider/deepseek): add Responses API model and web search tool (#24304))
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

export interface DeepSeekProvider extends ProviderV3 {
  /**
   * Creates a DeepSeek model for text generation.
   */
  (modelId: DeepSeekChatModelId): LanguageModelV3;

  /**
   * Creates a DeepSeek model for text generation.
   */
  languageModel(modelId: DeepSeekChatModelId): LanguageModelV3;

  /**
   * Creates a DeepSeek chat model for text generation.
   */
<<<<<<< HEAD
  chat(modelId: DeepSeekChatModelId): LanguageModelV3;
=======
  chat(modelId: DeepSeekChatModelId): LanguageModelV4;

  /**
   * Creates a DeepSeek model that uses the Responses API. Supports
   * server-side tools such as `deepseek.tools.webSearch()`.
   */
  responses(modelId: DeepSeekResponsesModelId): LanguageModelV4;

  /**
   * DeepSeek server-side tools for use with the Responses API.
   */
  tools: typeof deepseekTools;

  /**
   * Creates a DeepSeek files interface for uploading images.
   */
  files(): FilesV4;
>>>>>>> f9d43bdaa7 (feat(provider/deepseek): add Responses API model and web search tool (#24304))

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export function createDeepSeek(
  options: DeepSeekProviderSettings = {},
): DeepSeekProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.deepseek.com';

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

  const createLanguageModel = (modelId: DeepSeekChatModelId) => {
    return new DeepSeekChatLanguageModel(modelId, {
      provider: `deepseek.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      supportsAssistantPrefixCompletion: baseURL.endsWith('/beta'),
      supportsStrictToolCalls: baseURL.endsWith('/beta'),
    });
  };

<<<<<<< HEAD
=======
  const createResponsesModel = (modelId: DeepSeekResponsesModelId) =>
    new DeepSeekResponsesLanguageModel(modelId, {
      provider: 'deepseek.responses',
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

>>>>>>> f9d43bdaa7 (feat(provider/deepseek): add Responses API model and web search tool (#24304))
  const provider = (modelId: DeepSeekChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
<<<<<<< HEAD
=======
  provider.responses = createResponsesModel;
  provider.tools = deepseekTools;
  provider.files = createFiles;
>>>>>>> f9d43bdaa7 (feat(provider/deepseek): add Responses API model and web search tool (#24304))

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const deepseek = createDeepSeek();
