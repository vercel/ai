import {
  NoSuchModelError,
  type LanguageModelV2,
  type ProviderV2,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { GmicloudChatLanguageModel } from './gmicloud-chat-language-model';
import type { GmicloudChatModelId } from './gmicloud-chat-options';
import { gmicloudErrorStructure } from './gmicloud-error';
import { VERSION } from './version';

export interface GmicloudProviderSettings {
  /**
   * GMI Cloud API key. Defaults to the `GMI_CLOUD_APIKEY` environment
   * variable (matching GMI's own SDK package).
   */
  apiKey?: string;
  /**
   * Base URL for the API calls. Defaults to
   * `https://api.gmi-serving.com/v1`.
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

export interface GmicloudProvider extends ProviderV2 {
  /**
   * Creates a GMI Cloud model for text generation.
   */
  (modelId: GmicloudChatModelId): LanguageModelV2;

  /**
   * Creates a GMI Cloud model for text generation.
   */
  languageModel(modelId: GmicloudChatModelId): LanguageModelV2;

  /**
   * Creates a GMI Cloud chat model for text generation.
   */
  chat(modelId: GmicloudChatModelId): LanguageModelV2;
}

export function createGmicloud(
  options: GmicloudProviderSettings = {},
): GmicloudProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.gmi-serving.com/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'GMI_CLOUD_APIKEY',
          description: 'GMI Cloud API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/gmicloud/${VERSION}`,
    );

  const createLanguageModel = (modelId: GmicloudChatModelId) => {
    return new GmicloudChatLanguageModel(modelId, {
      provider: `gmicloud.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      errorStructure: gmicloudErrorStructure,
      includeUsage: true,
    });
  };

  const provider = (modelId: GmicloudChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v2' as const;
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

export const gmicloud = createGmicloud();
