import {
  LanguageModelV3,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { MiniMaxChatModelId } from './chat/minimax-chat-options';
import { MiniMaxChatLanguageModel } from './chat/minimax-chat-language-model';
import { VERSION } from './version';

export interface MiniMaxProviderSettings {
  /**
   * MiniMax API key.
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

export interface MiniMaxProvider extends ProviderV3 {
  /**
   * Creates a MiniMax model for text generation.
   */
  (modelId: MiniMaxChatModelId): LanguageModelV3;

  /**
   * Creates a MiniMax model for text generation.
   */
  languageModel(modelId: MiniMaxChatModelId): LanguageModelV3;

  /**
   * Creates a MiniMax chat model for text generation.
   */
  chat(modelId: MiniMaxChatModelId): LanguageModelV3;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export function createMiniMax(
  options: MiniMaxProviderSettings = {},
): MiniMaxProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.minimax.io/v1',
  );

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MINIMAX_API_KEY',
          description: 'MiniMax API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/minimax/${VERSION}`,
    );

  const createLanguageModel = (modelId: MiniMaxChatModelId) => {
    return new MiniMaxChatLanguageModel(modelId, {
      provider: `minimax.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: MiniMaxChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v3' as const;
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

export const minimax = createMiniMax();
