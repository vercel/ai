import {
  NoSuchModelError,
  type LanguageModelProviderV4,
  type TranscriptionModelProviderV4,
  type EmbeddingModelProviderV4,
  type ImageModelProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { GroqChatLanguageModel } from './groq-chat-language-model';
import type { GroqChatModelId } from './groq-chat-language-model-options';
import type { GroqTranscriptionModelId } from './groq-transcription-model-options';
import { GroqTranscriptionModel } from './groq-transcription-model';

import { groqTools } from './groq-tools';
import { VERSION } from './version';
export interface GroqProvider
  extends
    LanguageModelProviderV4<GroqChatModelId>,
    TranscriptionModelProviderV4<GroqTranscriptionModelId>,
    EmbeddingModelProviderV4,
    ImageModelProviderV4 {
  /**
   * Tools provided by Groq.
   */
  tools: typeof groqTools;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface GroqProviderSettings {
  /**
   * Base URL for the Groq API calls.
   */
  baseURL?: string;

  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

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

/**
 * Create an Groq provider instance.
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
      `ai-sdk-groq/${VERSION}`,
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

  const createTranscriptionModel = (modelId: GroqTranscriptionModelId) => {
    return new GroqTranscriptionModel(modelId, {
      provider: 'groq.transcription',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = function (modelId: GroqChatModelId) {
    return createLanguageModel(modelId);
  };

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.embedding = provider.embeddingModel;
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  provider.image = provider.imageModel;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  provider.tools = groqTools;

  return provider;
}

/**
 * Default Groq provider instance.
 */
export const groq = createGroq();
