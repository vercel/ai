import {
  LanguageModelV3,
  NoSuchModelError,
  ProviderV3
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  withUserAgentSuffix
} from '@ai-sdk/provider-utils';
import { OpenResponsesLanguageModel } from './responses/open-responses-language-model';
import { VERSION } from './version';

export interface OpenResponsesProvider extends ProviderV3 {
  (modelId: string): LanguageModelV3;
}

export interface OpenResponsesProviderSettings {
  /**
   * Base URL for the Open Responses API calls.
   */
  baseURL: string;

  /**
   * Provider name. Used as key for provider options and metadata.
   */
  name: string;

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


export function createOpenResponses(
  options: OpenResponsesProviderSettings
): OpenResponsesProvider {

  const providerName = options.name;

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        // TODO infer environment variable name from the provider name
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'OPEN_RESPONSES_API_KEY',
          description: 'Open Responses',
        })}`,
        ...options.headers,
      },
      `ai-sdk/open-responses/${VERSION}`,
    );


    const createResponsesModel = (modelId: string) => {
      return new OpenResponsesLanguageModel(modelId, {
        provider: `${providerName}.responses`,
        headers: getHeaders,
        baseURL: options.baseURL,
        fetch: options.fetch,
        generateId: () => generateId(),
      });
    };

  const createLanguageModel = (modelId: string) => {
    if (new.target) {
      throw new Error(
        'The OpenAI model function cannot be called with the new keyword.',
      );
    }

    return createResponsesModel(modelId);
  };


  const provider = function (modelId: string) {
    return createLanguageModel(modelId);
  };

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createLanguageModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as OpenResponsesProvider;
}
