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
import { VERSION } from './version';
import { ZaiChatLanguageModel } from './zai-chat-language-model';
import type { ZaiChatModelId } from './zai-chat-options';

export interface ZaiProviderSettings {
  /**
   * Z.AI API key. Defaults to the `ZAI_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for API calls. Defaults to
   * `https://api.z.ai/api/paas/v4`.
   */
  baseURL?: string;

  /**
   * Custom headers to include in requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation.
   */
  fetch?: FetchFunction;
}

export interface ZaiProvider extends ProviderV4 {
  /**
   * Creates a Z.AI chat model for text generation.
   */
  (modelId: ZaiChatModelId): LanguageModelV4;

  /**
   * Creates a Z.AI language model.
   */
  languageModel(modelId: ZaiChatModelId): LanguageModelV4;

  /**
   * Creates a Z.AI chat model.
   */
  chat(modelId: ZaiChatModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export function createZai(options: ZaiProviderSettings = {}): ZaiProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.z.ai/api/paas/v4';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ZAI_API_KEY',
          description: 'Z.AI API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/zai/${VERSION}`,
    );

  const createLanguageModel = (modelId: ZaiChatModelId) =>
    new ZaiChatLanguageModel(modelId, {
      provider: 'zai.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: ZaiChatModelId) => createLanguageModel(modelId);

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

export const zai = createZai();
