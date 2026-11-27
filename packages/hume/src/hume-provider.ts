import { NoSuchModelError, type ProviderV4 } from '@ai-sdk/provider';
import type { FetchFunction, Resolvable } from '@ai-sdk/provider-utils';

export interface HumeProvider extends ProviderV4 {}

export interface HumeProviderSettings {
  /**
   * API key for authenticating requests. May be a string, promise, or a
   * synchronous/asynchronous callback called before each request.
   */
  apiKey?: Resolvable<string>;

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
 * Create an Hume provider instance.
 */
export function createHume(_options: HumeProviderSettings = {}): HumeProvider {
  return {
    specificationVersion: 'v4',
    languageModel(modelId) {
      throw new NoSuchModelError({
        modelId,
        modelType: 'languageModel',
        message: 'Hume does not provide language models',
      });
    },
    embeddingModel(modelId) {
      throw new NoSuchModelError({
        modelId,
        modelType: 'embeddingModel',
        message: 'Hume does not provide embedding models',
      });
    },
    imageModel(modelId) {
      throw new NoSuchModelError({
        modelId,
        modelType: 'imageModel',
        message: 'Hume does not provide image models',
      });
    },
  };
}

/**
 * Default Hume provider instance.
 */
export const hume = createHume();
