import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
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
import type { ZaiChatModelId } from './zai-chat-options';
import { VERSION } from './version';

export interface ZaiProviderSettings {
  /**
   * Z.AI API key. Default value is taken from the `ZAI_API_KEY`
   * environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   *
   * Default: `https://api.z.ai/api/coding/paas/v4` (Coding plan).
   *
   * For the Chat plan, use `https://api.z.ai/api/paas/v4`.
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

export interface ZaiProvider extends ProviderV4 {
  /**
   * Creates a chat model for text generation.
   */
  (modelId?: ZaiChatModelId): LanguageModelV4;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId?: ZaiChatModelId): LanguageModelV4;

  /**
   * Creates a language model for text generation. Alias for chatModel.
   */
  languageModel(modelId?: ZaiChatModelId): LanguageModelV4;
}

// Z.AI API base URL (Coding plan)
const defaultBaseURL = 'https://api.z.ai/api/coding/paas/v4';

export function createZai(options: ZaiProviderSettings = {}): ZaiProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);
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

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `zai.${modelType}`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (modelId?: ZaiChatModelId) =>
    new OpenAICompatibleChatLanguageModel(modelId ?? 'glm-5.2', {
      ...getCommonModelConfig('chat'),
    });

  const provider = (modelId?: ZaiChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.chatModel = createChatModel;
  provider.languageModel = createChatModel;
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
