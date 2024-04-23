import { Google } from './google-facade';
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
Base URL for the Google API calls.
   */
  baseURL?: string;

  /**
@deprecated Use `baseURL` instead.
   */
  baseUrl?: string;

  /**
API key for authenticating requests.
   */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  generateId?: () => string;
}

/**
Create a Google Generative AI provider instance.
 */
export function createGoogleGenerativeAI(
  options: GoogleGenerativeAIProviderSettings = {},
): GoogleGenerativeAIProvider {
  const google = new Google(options);

  const provider = function (
    modelId: GoogleGenerativeAIModelId,
    settings?: GoogleGenerativeAISettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Google Generative AI model function cannot be called with the new keyword.',
      );
    }

    return google.chat(modelId, settings);
  };

  provider.chat = google.chat.bind(google);
  provider.generativeAI = google.generativeAI.bind(google);

  return provider as GoogleGenerativeAIProvider;
}

/**
Default Google Generative AI provider instance.
 */
export const google = createGoogleGenerativeAI();
