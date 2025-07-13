import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { MoonshotChatModelId } from './moonshot-chat-options';

export interface MoonshotProviderSettings {
  /**
   * Moonshot API key.
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

export interface MoonshotProvider extends ProviderV2 {
  /**
   * Creates a Moonshot model for text generation.
   */
  (modelId: MoonshotChatModelId): LanguageModelV2;

  /**
   * Creates a Moonshot model for text generation.
   */
  languageModel(modelId: MoonshotChatModelId): LanguageModelV2;

  /**
   * Creates a Moonshot chat model for text generation.
   */
  chat(modelId: MoonshotChatModelId): LanguageModelV2;
}

export function createMoonshot(
  options: MoonshotProviderSettings = {},
): MoonshotProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.moonshot.ai/v1',
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'MOONSHOT_API_KEY',
      description: 'Moonshot API key',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (modelId: MoonshotChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `moonshot.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: MoonshotChatModelId) =>
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

export const moonshot = createMoonshot();
