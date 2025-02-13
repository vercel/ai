import {
  LanguageModelV1,
  ProviderV1,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { InflectionChatLanguageModel } from './inflection-chat-language-model';
import {
  InflectionChatModelId,
  InflectionChatSettings,
} from './inflection-chat-settings';

export interface InflectionProvider extends ProviderV1 {
  (
    modelId: InflectionChatModelId,
    settings?: InflectionChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a model for text generation.
   */
  languageModel(
    modelId: InflectionChatModelId,
    settings?: InflectionChatSettings,
  ): LanguageModelV1;

  /**
   * Creates a model for text generation.
   */
  chat(
    modelId: InflectionChatModelId,
    settings?: InflectionChatSettings,
  ): LanguageModelV1;

  /**
   * Not supported by Inflection AI
   * @throws {UnsupportedFunctionalityError}
   */
  textEmbeddingModel(modelId: string): never;
}

export interface InflectionProviderSettings {
  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers.
   * The default prefix is `https://layercake.pubwestus3.inf7ks8.com/external/api/inference`
   */
  baseURL?: string;

  /**
   * API key that is being sent using the `Authorization` header.
   * It defaults to the `INFLECTION_API_KEY` environment variable.
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
 * Create an Inflection AI provider instance.
 */
export function createInflection(
  options: InflectionProviderSettings = {},
): InflectionProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://layercake.pubwestus3.inf7ks8.com/external/api/inference';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'INFLECTION_API_KEY',
      description: 'Inflection',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: InflectionChatModelId,
    settings: InflectionChatSettings = {},
  ) =>
    new InflectionChatLanguageModel(modelId, settings, {
      provider: 'inflection.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: InflectionChatModelId,
    settings?: InflectionChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Inflection model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = () => {
    throw new UnsupportedFunctionalityError({
      functionality: 'Text embeddings are not supported by Inflection AI',
    });
  };

  return provider;
}

/**
 * Default Inflection provider instance.
 */
export const inflection = createInflection();
