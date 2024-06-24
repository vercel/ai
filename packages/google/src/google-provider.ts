import {
  generateId,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { GoogleGenerativeAILanguageModel } from './google-generative-ai-language-model';
import {
  GoogleGenerativeAIModelId,
  GoogleGenerativeAISettings,
} from './google-generative-ai-settings';

export interface GoogleGenerativeAIProvider {
  (
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ): GoogleGenerativeAILanguageModel;

  languageModel(
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ): GoogleGenerativeAILanguageModel;

  chat(
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ): GoogleGenerativeAILanguageModel;

  /**
   * @deprecated Use `chat()` instead.
   */
  generativeAI(
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ): GoogleGenerativeAILanguageModel;
}

export interface GoogleGenerativeAIProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://generativelanguage.googleapis.com/v1beta`.
   */
  baseURL?: string;

  /**
@deprecated Use `baseURL` instead.
   */
  baseUrl?: string;

  /**
API key that is being send using the `x-goog-api-key` header.
It defaults to the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable.
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
Create a Google Generative AI provider instance.
 */
export function createGoogleGenerativeAI(
  options: GoogleGenerativeAIProviderSettings = {},
): GoogleGenerativeAIProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
    'https://generativelanguage.googleapis.com/v1beta';

  const getHeaders = () => ({
    'x-goog-api-key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'GOOGLE_GENERATIVE_AI_API_KEY',
      description: 'Google Generative AI',
    }),
    ...options.headers,
  });

  const createChatModel = (
    modelId: GoogleGenerativeAIModelId,
    settings: GoogleGenerativeAISettings = {},
  ) =>
    new GoogleGenerativeAILanguageModel(modelId, settings, {
      provider: 'google.generative-ai',
      baseURL,
      headers: getHeaders,
      generateId: options.generateId ?? generateId,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Google Generative AI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.generativeAI = createChatModel;

  return provider as GoogleGenerativeAIProvider;
}

/**
Default Google Generative AI provider instance.
 */
export const google = createGoogleGenerativeAI();
