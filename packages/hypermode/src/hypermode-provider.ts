import type {
  EmbeddingModelV1,
  LanguageModelV1,
  ProviderV1,
} from '@ai-sdk/provider';
import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { HypermodeChatLanguageModel } from './hypermode-chat-language-model';
import type {
  HypermodeChatModelId,
  HypermodeChatSettings,
} from './hypermode-chat-settings';
import { HypermodeEmbeddingModel } from './hypermode-embedding-model';
import type {
  HypermodeEmbeddingModelId,
  HypermodeEmbeddingSettings,
} from './hypermode-embedding-settings';

export interface HypermodeProviderSettings {
  /**
   * Base URL for the Hypermode API calls.
   */
  baseURL?: string;
  /**
   * Hypermode API key.
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

export interface HypermodeProvider extends ProviderV1 {
  (
    modelId: HypermodeChatModelId,
    settings?: HypermodeChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a model for text generation.
   */
  languageModel(
    modelId: HypermodeChatModelId,
    settings?: HypermodeChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a model for text generation.
   */
  chat(
    modelId: HypermodeChatModelId,
    settings?: HypermodeChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a model for text embeddings.
   */
  embedding(
    modelId: HypermodeEmbeddingModelId,
    settings?: HypermodeEmbeddingSettings,
  ): EmbeddingModelV1<string>;

  /**
   * Creates a model for text embeddings.
   */
  textEmbeddingModel(
    modelId: HypermodeEmbeddingModelId,
    settings?: HypermodeEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

/**
 * Create a Hypermode provider instance.
 */
export function createHypermode(
  options: HypermodeProviderSettings = {},
): HypermodeProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://models.hypermode.host/v1';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'HYPERMODE_API_KEY',
      description: 'Hypermode API key',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: HypermodeChatModelId,
    settings: HypermodeChatSettings = {},
  ) =>
    new HypermodeChatLanguageModel(modelId, settings, {
      provider: 'hypermode.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (
    modelId: HypermodeEmbeddingModelId,
    settings: HypermodeEmbeddingSettings = {},
  ) =>
    new HypermodeEmbeddingModel(modelId, settings, {
      provider: 'hypermode.embedding',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: HypermodeChatModelId,
    settings?: HypermodeChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Hypermode model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider;
}

/**
 * Default Hypermode provider instance.
 */
export const hypermode = createHypermode();
