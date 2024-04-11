import { generateId, loadApiKey } from '@ai-sdk/provider-utils';
import { GoogleGenerativeAILanguageModel } from './google-generative-ai-language-model';
import {
  GoogleGenerativeAIModelId,
  GoogleGenerativeAISettings,
} from './google-generative-ai-settings';

/**
 * Google provider.
 */
export class Google {
  readonly baseUrl?: string;
  readonly apiKey?: string;

  private readonly generateId: () => string;

  constructor(
    options: {
      baseUrl?: string;
      apiKey?: string;
      generateId?: () => string;
    } = {},
  ) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.generateId = options.generateId ?? generateId;
  }

  private get baseConfig() {
    return {
      baseUrl:
        this.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta',
      headers: () => ({
        'x-goog-api-key': loadApiKey({
          apiKey: this.apiKey,
          environmentVariableName: 'GOOGLE_GENERATIVE_AI_API_KEY',
          description: 'Google Generative AI',
        }),
      }),
    };
  }

  generativeAI(
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
