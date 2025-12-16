import { NoSuchModelError, ProviderV3 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { loadApiKey, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { ReplicateImageModel } from './replicate-image-model';
import { ReplicateImageModelId } from './replicate-image-settings';
import { ReplicateLanguageModel } from './replicate-language-model';
import { ReplicateLanguageModelId } from './replicate-language-settings';
import { VERSION } from './version';

export interface ReplicateProviderSettings {
  /**
API token that is being send using the `Authorization` header.
It defaults to the `REPLICATE_API_TOKEN` environment variable.
   */
  apiToken?: string;

  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.replicate.com/v1`.
   */
  baseURL?: string;

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

export interface ReplicateProvider extends ProviderV3 {
  /**
   * Creates a Replicate language model.
   */
  languageModel(modelId: ReplicateLanguageModelId): ReplicateLanguageModel;

  /**
   * Creates a Replicate image generation model.
   */
  image(modelId: ReplicateImageModelId): ReplicateImageModel;

  /**
   * Creates a Replicate image generation model.
   */
  imageModel(modelId: ReplicateImageModelId): ReplicateImageModel;
}

/**
 * Create a Replicate provider instance.
 */
export function createReplicate(
  options: ReplicateProviderSettings = {},
): ReplicateProvider {
  const baseURL = options.baseURL ?? 'https://api.replicate.com/v1';
  const headers = withUserAgentSuffix(
    {
      Authorization: `Bearer ${loadApiKey({
        apiKey: options.apiToken,
        environmentVariableName: 'REPLICATE_API_TOKEN',
        description: 'Replicate',
      })}`,
      ...options.headers,
    },
    `ai-sdk/replicate/${VERSION}`,
  );

  const createLanguageModel = (modelId: ReplicateLanguageModelId) =>
    new ReplicateLanguageModel(modelId, {
      provider: 'replicate.languageModel',
      baseURL,
      headers,
      fetch: options.fetch,
    });

  const createImageModel = (modelId: ReplicateImageModelId) =>
    new ReplicateImageModel(modelId, {
      provider: 'replicate.image',
      baseURL,
      headers,
      fetch: options.fetch,
    });

  return {
    specificationVersion: 'v3' as const,
    languageModel: createLanguageModel,
    image: createImageModel,
    imageModel: createImageModel,
    embeddingModel: (modelId: string) => {
      throw new NoSuchModelError({
        modelId,
        modelType: 'embeddingModel',
      });
    },
  };
}

/**
 * Default Replicate provider instance.
 */
export const replicate = createReplicate();
