import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';
import {
  AnthropicMessagesModelId,
  AnthropicMessagesSettings,
} from './anthropic-messages-settings';

/**
 * Anthropic provider.
 */
export class Anthropic {
  /**
   * Base URL for the Anthropic API calls.
   */
  readonly baseURL: string;

  readonly apiKey?: string;

  /**
   * Creates a new Anthropic provider instance.
   */
  constructor(
    options: {
      /**
       * Base URL for the Anthropic API calls.
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
      'https://api.anthropic.com/v1';
    this.apiKey = options.apiKey;
  }

  private get baseConfig() {
    return {
      baseURL: this.baseURL,
      headers: () => ({
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'tools-2024-04-04',
        'x-api-key': loadApiKey({
          apiKey: this.apiKey,
          environmentVariableName: 'ANTHROPIC_API_KEY',
          description: 'Anthropic',
        }),
      }),
    };
  }

  /**
   * @deprecated Use `chat()` instead.
   */
  messages(
    modelId: AnthropicMessagesModelId,
    settings: AnthropicMessagesSettings = {},
  ) {
    this.chat(modelId, settings);
  }

  chat(
    modelId: AnthropicMessagesModelId,
    settings: AnthropicMessagesSettings = {},
  ) {
    return new AnthropicMessagesLanguageModel(modelId, settings, {
      provider: 'anthropic.messages',
      ...this.baseConfig,
    });
  }
}

/**
 * Default Anthropic provider instance.
 */
export const anthropic = new Anthropic();
