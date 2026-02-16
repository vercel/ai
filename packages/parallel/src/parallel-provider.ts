import {
  LanguageModelV3,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { ParallelLanguageModel } from './parallel-language-model';
import { ParallelLanguageModelId } from './parallel-language-model-options';
import { VERSION } from './version';

export interface ParallelProvider extends ProviderV3 {
  /**
Creates a Parallel chat model for text generation.
   */
  (modelId: ParallelLanguageModelId): LanguageModelV3;

  /**
Creates a Parallel language model for text generation.
   */
  languageModel(modelId: ParallelLanguageModelId): LanguageModelV3;
}

export interface ParallelProviderSettings {
  /**
Base URL for the Parallel API calls.
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

export function createParallel(
  options: ParallelProviderSettings = {},
): ParallelProvider {
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'PARALLEL_API_KEY',
          description: 'Parallel',
        })}`,
        ...options.headers,
      },
      `ai-sdk/parallel/${VERSION}`,
    );

  const createLanguageModel = (modelId: ParallelLanguageModelId) => {
    return new ParallelLanguageModel(modelId, {
      baseURL: withoutTrailingSlash(
        options.baseURL ?? 'https://api.parallel.ai',
      )!,
      headers: getHeaders,
      generateId,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: ParallelLanguageModelId) =>
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

export const parallel = createParallel();
