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
import { GroqChatLanguageModel } from './groq-chat-language-model';
import { GroqChatModelId } from './groq-chat-options';

import { VERSION } from './version';
export interface GroqProvider extends ProviderV3 {
  /**
Creates a model for text generation.
*/
  (modelId: GroqChatModelId): LanguageModelV3;

  /**
Creates an Groq chat model for text generation.
   */
  languageModel(modelId: GroqChatModelId): LanguageModelV3;
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

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'GROQ_API_KEY',
          description: 'Groq',
        })}`,
        ...options.headers,
      },
      `ai-sdk/groq/${VERSION}`,
    );

  const createChatModel = (modelId: GroqChatModelId) =>
    new GroqChatLanguageModel(modelId, {
      provider: 'groq.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createLanguageModel = (modelId: GroqChatModelId) => {
    if (new.target) {
      throw new Error(
        'The Groq model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  const provider = function (modelId: GroqChatModelId) {
    return createLanguageModel(modelId);
  };

  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;

  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  provider.transcription = () => {
    throw new NoSuchModelError({
      modelId: 'transcription',
      modelType: 'transcriptionModel',
    });
  };
  provider.transcriptionModel = () => {
    throw new NoSuchModelError({
      modelId: 'transcription',
      modelType: 'transcriptionModel',
    });
  };

  return provider;
}

/**
Default Groq provider instance.
 */
export const groq = createGroq();
