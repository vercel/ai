import {
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
import type { SiliconFlowChatModelId } from './chat/siliconflow-chat-options';
import { SiliconFlowChatLanguageModel } from './chat/siliconflow-chat-language-model';
import { VERSION } from './version';

export interface SiliconFlowProviderSettings {
  /**
   * SiliconFlow API key.
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

export interface SiliconFlowProvider extends ProviderV4 {
  /**
   * Creates a SiliconFlow model for text generation.
   */
  (modelId: SiliconFlowChatModelId): LanguageModelV4;

  /**
   * Creates a SiliconFlow model for text generation.
   */
  languageModel(modelId: SiliconFlowChatModelId): LanguageModelV4;

  /**
   * Creates a SiliconFlow chat model for text generation.
   */
  chat(modelId: SiliconFlowChatModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export function createSiliconFlow(
  options: SiliconFlowProviderSettings = {},
): SiliconFlowProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.siliconflow.cn/v1',
  );

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'SILICONFLOW_API_KEY',
          description: 'SiliconFlow API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/siliconflow/${VERSION}`,
    );

  const createLanguageModel = (modelId: SiliconFlowChatModelId) => {
    return new SiliconFlowChatLanguageModel(modelId, {
      provider: `siliconflow.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: SiliconFlowChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const siliconflow = createSiliconFlow();
