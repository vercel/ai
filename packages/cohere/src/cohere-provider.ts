import {
  generateId,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { CohereChatModelId, CohereChatSettings } from './cohere-chat-settings';
import { CohereChatLanguageModel } from './cohere-chat-language-model';

export interface CohereProvider {
  (
    modelId: CohereChatModelId,
    settings?: CohereChatSettings,
  ): CohereChatLanguageModel;

  /**
Creates a model for text generation.
*/
  languageModel(
    modelId: CohereChatModelId,
    settings?: CohereChatSettings,
  ): CohereChatLanguageModel;
}

export interface CohereProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.cohere.com/v1`.
   */
  baseURL?: string;

  /**
API key that is being send using the `Authorization` header.
It defaults to the `MISTRAL_API_KEY` environment variable.
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
  fetch?: typeof fetch;

  generateId?: () => string;
}

/**
Create a Cohere AI provider instance.
 */
export function createCohere(
  options: CohereProviderSettings = {},
): CohereProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.cohere.com/v1';

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'COHERE_API_KEY',
      description: 'Cohere',
    })}`,
    ...options.headers,
  });

  const createChatModel = (
    modelId: CohereChatModelId,
    settings: CohereChatSettings = {},
  ) =>
    new CohereChatLanguageModel(modelId, settings, {
      provider: 'mistral.chat',
      baseURL,
      headers: getHeaders,
      generateId: options.generateId ?? generateId,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: CohereChatModelId,
    settings?: CohereChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Cohere model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;

  return provider as CohereProvider;
}

/**
Default Cohere provider instance.
 */
export const cohere = createCohere();
