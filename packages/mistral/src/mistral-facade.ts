import {
  generateId,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { MistralChatLanguageModel } from './mistral-chat-language-model';
import {
  MistralChatModelId,
  MistralChatSettings,
} from './mistral-chat-settings';

/**
 * Mistral provider.
 */
export class Mistral {
  /**
   * Base URL for the Mistral API calls.
   */
  readonly baseURL: string;

  readonly apiKey?: string;

  private readonly generateId: () => string;

  /**
   * Creates a new Mistral provider instance.
   */
  constructor(
    options: {
      /**
       * Base URL for the Mistral API calls.
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
      'https://api.mistral.ai/v1';

    this.apiKey = options.apiKey;
    this.generateId = options.generateId ?? generateId;
  }

  private get baseConfig() {
    return {
      baseURL: this.baseURL,
      headers: () => ({
        Authorization: `Bearer ${loadApiKey({
          apiKey: this.apiKey,
          environmentVariableName: 'MISTRAL_API_KEY',
          description: 'Mistral',
        })}`,
      }),
    };
  }

  chat(modelId: MistralChatModelId, settings: MistralChatSettings = {}) {
    return new MistralChatLanguageModel(modelId, settings, {
      provider: 'mistral.chat',
      ...this.baseConfig,
      generateId: this.generateId,
    });
  }
}

/**
 * Default Mistral provider instance.
 */
export const mistral = new Mistral();
