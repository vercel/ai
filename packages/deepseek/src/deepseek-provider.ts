import {
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { DeepSeekChatModelId } from './chat/deepseek-chat-options';
import { DeepSeekChatLanguageModel } from './chat/deepseek-chat-language-model';
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

export interface DeepSeekProvider extends ProviderV2 {
  /**
Creates a DeepSeek model for text generation.
*/
  (modelId: DeepSeekChatModelId): LanguageModelV2;

  /**
Creates a DeepSeek model for text generation.
*/
  languageModel(modelId: DeepSeekChatModelId): LanguageModelV2;

  /**
Creates a DeepSeek chat model for text generation.
*/
  chat(modelId: DeepSeekChatModelId): LanguageModelV2;
}

export function createDeepSeek(
  options: DeepSeekProviderSettings = {},
): DeepSeekProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.deepseek.com',
  );

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
    });
  };

  const provider = (modelId: DeepSeekChatModelId) =>
    createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const deepseek = createDeepSeek();
