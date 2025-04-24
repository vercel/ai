import {
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { PerplexityLanguageModel } from './perplexity-language-model';
import { PerplexityLanguageModelId } from './perplexity-language-model-options';

export interface PerplexityProvider extends ProviderV2 {
  /**
Creates an Perplexity chat model for text generation.
   */
  (modelId: PerplexityLanguageModelId): LanguageModelV2;

  /**
Creates an Perplexity language model for text generation.
   */
  languageModel(modelId: PerplexityLanguageModelId): LanguageModelV2;
}

export interface PerplexityProviderSettings {
  /**
Base URL for the perplexity API calls.
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

export function createPerplexity(
  options: PerplexityProviderSettings = {},
): PerplexityProvider {
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'PERPLEXITY_API_KEY',
      description: 'Perplexity',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (modelId: PerplexityLanguageModelId) => {
    return new PerplexityLanguageModel(modelId, {
      baseURL: withoutTrailingSlash(
        options.baseURL ?? 'https://api.perplexity.ai',
      )!,
      headers: getHeaders,
      generateId,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: PerplexityLanguageModelId) =>
    createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;

  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const perplexity = createPerplexity();
