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
import { NebulChatLanguageModel } from './nebul-chat-language-model';
import type { NebulChatModelId } from './nebul-chat-options';
import { VERSION } from './version';

export interface NebulProviderSettings {
  /**
   * Nebul API key. Defaults to the `NEBUL_API_KEY` environment variable.
   */
  apiKey?: string;
  /**
   * Base URL for the API calls. Defaults to
   * `https://api.inference.nebul.io/v1`.
   */
  baseURL?: string;
  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;
  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface NebulProvider extends ProviderV4 {
  /**
   * Creates a Nebul model for text generation.
   */
  (modelId: NebulChatModelId): LanguageModelV4;

  /**
   * Creates a Nebul model for text generation.
   */
  languageModel(modelId: NebulChatModelId): LanguageModelV4;

  /**
   * Creates a Nebul chat model for text generation.
   */
  chat(modelId: NebulChatModelId): LanguageModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export function createNebul(
  options: NebulProviderSettings = {},
): NebulProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.inference.nebul.io/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'NEBUL_API_KEY',
          description: 'Nebul API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/nebul/${VERSION}`,
    );

  const createLanguageModel = (modelId: NebulChatModelId) => {
    return new NebulChatLanguageModel(modelId, {
      provider: `nebul.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      supportsStructuredOutputs: true,
    });
  };

  const provider = (modelId: NebulChatModelId) => createLanguageModel(modelId);

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

export const nebul = createNebul();
