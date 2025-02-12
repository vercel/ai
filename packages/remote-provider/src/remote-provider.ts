import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from '@ai-sdk/provider';
import { FetchFunction, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { RemoteLanguageModel } from './remote-language-model';
import { RemoteModelId } from './remote-language-model-settings';

export interface RemoteProvider extends ProviderV1 {
  (modelId: string): LanguageModelV1;

  /**
Creates a model for text generation.
*/
  languageModel(modelId: RemoteModelId): LanguageModelV1;
}

export interface RemoteProviderSettings {
  /**
The base URL prefix for API calls.
   */
  baseURL: string;

  /**
API key that is being send using the `Authorization` header.
   */
  apiKey: string;

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
Create a Mistral AI provider instance.
 */
export function createRemoteProvider(
  options: RemoteProviderSettings,
): RemoteProvider {
  const baseURL = withoutTrailingSlash(options.baseURL)!;

  const getHeaders = () => ({
    // Authorization: `Bearer ${loadApiKey({
    //   apiKey: options.apiKey,
    //   environmentVariableName: 'MISTRAL_API_KEY',
    //   description: 'Mistral',
    // })}`,
    ...options.headers,
  });

  const createLanguageModel = (modelId: RemoteModelId) =>
    new RemoteLanguageModel(modelId, {
      provider: 'remote',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: RemoteModelId) {
    if (new.target) {
      throw new Error(
        'The Remote model function cannot be called with the new keyword.',
      );
    }

    return createLanguageModel(modelId);
  };

  provider.languageModel = createLanguageModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  return provider;
}
