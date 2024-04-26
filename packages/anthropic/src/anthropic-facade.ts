import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';
import {
  AnthropicMessagesModelId,
  AnthropicMessagesSettings,
} from './anthropic-messages-settings';
import { AnthropicProviderSettings } from './anthropic-provider';

/**
 * @deprecated Use `createAnthropic` instead.
 */
export class Anthropic {
  /**
   * Base URL for Anthropic API calls.
   */
  readonly baseURL: string;

  readonly apiKey?: string;

  readonly headers?: Record<string, string>;

  /**
   * Creates a new Anthropic provider instance.
   */
  constructor(options: AnthropicProviderSettings = {}) {
    this.baseURL =
      withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
      'https://api.anthropic.com/v1';
    this.apiKey = options.apiKey;
    this.headers = options.headers;
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
        ...this.headers,
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
    return this.chat(modelId, settings);
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
