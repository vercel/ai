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
import type { CrusoeChatModelId } from './crusoe-chat-options';
import { VERSION } from './version';

export interface CrusoeProviderSettings {
  /**
   * Crusoe API key. Defaults to the `CRUSOE_API_KEY` environment variable.
   * Obtain one from https://console.crusoecloud.com/foundry/api-keys.
   */
  apiKey?: string;

  /**
   * Base URL for the Crusoe Intelligence Foundry API.
   * Defaults to `https://api.inference.crusoecloud.com/v1`.
   */
  baseURL?: string;

  /**
   * Custom headers to include in every request.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface CrusoeProvider extends ProviderV4 {
  /**
   * Creates a Crusoe language model for text generation.
   */
  (modelId: CrusoeChatModelId): LanguageModelV4;

  /**
   * Creates a Crusoe language model for text generation.
   */
  languageModel(modelId: CrusoeChatModelId): LanguageModelV4;

  /**
   * Creates a Crusoe chat model for text generation.
   */
  chat(modelId: CrusoeChatModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

const defaultBaseURL = 'https://api.inference.crusoecloud.com/v1';

export function createCrusoe(
  options: CrusoeProviderSettings = {},
): CrusoeProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'CRUSOE_API_KEY',
          description: 'Crusoe API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/crusoe/${VERSION}`,
    );

  const createLanguageModel = (modelId: CrusoeChatModelId): LanguageModelV4 =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: 'crusoe.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: CrusoeChatModelId): LanguageModelV4 =>
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

export const crusoe = createCrusoe();
