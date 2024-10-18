import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { GroqChatLanguageModel } from './groq-chat-language-model';
import { GroqChatModelId, GroqChatSettings } from './groq-chat-settings';

export interface GroqProvider extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (modelId: GroqChatModelId, settings?: GroqChatSettings): LanguageModelV1;

  /**
Creates an Groq chat model for text generation.
   */
  languageModel(
    modelId: GroqChatModelId,
    settings?: GroqChatSettings,
  ): LanguageModelV1;
}

export interface GroqProviderSettings {
  /**
Base URL for the Groq API calls.
     */
  baseURL?: string;

  /**
API key for authenticating requests.
     */
  apiKey?: string;

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

/**
Create an Groq provider instance.
 */
export function createGroq(options: GroqProviderSettings = {}): GroqProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.groq.com/openai/v1';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'GROQ_API_KEY',
      description: 'Groq',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: GroqChatModelId,
    settings: GroqChatSettings = {},
  ) =>
    new GroqChatLanguageModel(modelId, settings, {
      provider: 'groq.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createLanguageModel = (
    modelId: GroqChatModelId,
    settings?: GroqChatSettings,
  ) => {
    if (new.target) {
      throw new Error(
        'The Groq model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  const provider = function (
    modelId: GroqChatModelId,
    settings?: GroqChatSettings,
  ) {
    return createLanguageModel(modelId, settings);
  };

  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider as GroqProvider;
}

/**
Default Groq provider instance.
 */
export const groq = createGroq();
