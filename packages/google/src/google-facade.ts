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

/**
 * Google provider.
 */
export class Google {
  /**
   * Base URL for the Google API calls.
   */
  readonly baseURL: string;

  readonly apiKey?: string;

  private readonly generateId: () => string;

  /**
   * Creates a new Google provider instance.
   */
  constructor(
    options: {
      /**
       * Base URL for the Google API calls.
       */
      baseURL?: string;

      /**
       * @deprecated Use `baseURL` instead.
       */
      baseUrl?: string;

      /**
       * API key for authenticating requests.
       */
      apiKey?: string;

      generateId?: () => string;
    } = {},
  ) {
    this.baseURL =
      withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
      'https://generativelanguage.googleapis.com/v1beta';
    this.apiKey = options.apiKey;
    this.generateId = options.generateId ?? generateId;
  }

  private get baseConfig() {
    return {
      baseURL: this.baseURL,
      headers: () => ({
        'x-goog-api-key': loadApiKey({
          apiKey: this.apiKey,
          environmentVariableName: 'GOOGLE_GENERATIVE_AI_API_KEY',
          description: 'Google Generative AI',
        }),
      }),
    };
  }

  /**
   * @deprecated Use `chat()` instead.
   */
  generativeAI(
    modelId: GoogleGenerativeAIModelId,
    settings: GoogleGenerativeAISettings = {},
  ) {
    return this.chat(modelId, settings);
  }

  chat(
    modelId: GoogleGenerativeAIModelId,
    settings: GoogleGenerativeAISettings = {},
  ) {
    return new GoogleGenerativeAILanguageModel(modelId, settings, {
      provider: 'google.generative-ai',
      ...this.baseConfig,
      generateId: this.generateId,
    });
  }
}

/**
 * Default Google provider instance.
 */
export const google = new Google();
