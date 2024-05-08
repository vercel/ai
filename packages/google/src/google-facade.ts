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
import { GoogleGenerativeAIProviderSettings } from './google-provider';

/**
 * @deprecated Use `createGoogleGenerativeAI` instead.
 */
export class Google {
  /**
   * Base URL for the Google API calls.
   */
  readonly baseURL: string;

  readonly apiKey?: string;

  readonly headers?: Record<string, string>;

  private readonly generateId: () => string;

  /**
   * Creates a new Google provider instance.
   */
  constructor(options: GoogleGenerativeAIProviderSettings = {}) {
    this.baseURL =
      withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
      'https://generativelanguage.googleapis.com/v1beta';
    this.apiKey = options.apiKey;
    this.headers = options.headers;
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
        ...this.headers,
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
