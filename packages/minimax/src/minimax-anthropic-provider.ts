import { AnthropicMessagesLanguageModel } from '@ai-sdk/anthropic/internal';
import {
  LanguageModelV3,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { MinimaxChatModelId } from './minimax-chat-options';
import { VERSION } from './version';

export interface MinimaxAnthropicProviderSettings {
  /**
MiniMax API key.
*/
  apiKey?: string;
  /**
Base URL for the API calls.
Default: 'https://api.minimax.io/anthropic/v1'
*/
  baseURL?: string;
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

export interface MinimaxAnthropicProvider extends ProviderV3 {
  /**
Creates a MiniMax model for text generation using Anthropic-compatible API.
*/
  (modelId: MinimaxChatModelId): LanguageModelV3;

  /**
Creates a MiniMax model for text generation using Anthropic-compatible API.
*/
  languageModel(modelId: MinimaxChatModelId): LanguageModelV3;

  /**
Creates a MiniMax chat model for text generation using Anthropic-compatible API.
*/
  chat(modelId: MinimaxChatModelId): LanguageModelV3;
}

export function createMinimaxAnthropic(
  options: MinimaxAnthropicProviderSettings = {},
): MinimaxAnthropicProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.minimax.io/anthropic/v1',
  ) as string;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        'anthropic-version': '2023-06-01',
        'x-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MINIMAX_API_KEY',
          description: 'MiniMax API key',
        }),
        ...options.headers,
      },
      `ai-sdk/minimax/${VERSION}`,
    );

  const createLanguageModel = (modelId: MinimaxChatModelId) => {
    return new AnthropicMessagesLanguageModel(modelId, {
      provider: 'minimax.messages',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: generateId,
      supportedUrls: () => ({
        'image/*': [/^https?:\/\/.*$/],
      }),
    });
  };

  const provider = (modelId: MinimaxChatModelId) =>
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

/**
Default MiniMax provider instance using Anthropic-compatible API.
*/
export const minimaxAnthropic = createMinimaxAnthropic();

