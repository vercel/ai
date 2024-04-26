import { Anthropic } from './anthropic-facade';
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';
import {
  AnthropicMessagesModelId,
  AnthropicMessagesSettings,
} from './anthropic-messages-settings';

export interface AnthropicProvider {
  (
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): AnthropicMessagesLanguageModel;

  chat(
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): AnthropicMessagesLanguageModel;

  /**
   * @deprecated Use `chat()` instead.
   */
  messages(
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ): AnthropicMessagesLanguageModel;
}

export interface AnthropicProviderSettings {
  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.anthropic.com/v1`.
   */
  baseURL?: string;

  /**
@deprecated Use `baseURL` instead.
   */
  baseUrl?: string;

  /**
API key that is being send using the `x-api-key` header.
It defaults to the `ANTHROPIC_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  generateId?: () => string;
}

/**
Create an Anthropic provider instance.
 */
export function createAnthropic(
  options: AnthropicProviderSettings = {},
): AnthropicProvider {
  const anthropic = new Anthropic(options);

  const provider = function (
    modelId: AnthropicMessagesModelId,
    settings?: AnthropicMessagesSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Anthropic model function cannot be called with the new keyword.',
      );
    }

    return anthropic.chat(modelId, settings);
  };

  provider.chat = anthropic.chat.bind(anthropic);
  provider.messages = anthropic.messages.bind(anthropic);

  return provider as AnthropicProvider;
}

/**
Default Anthropic provider instance.
 */
export const anthropic = createAnthropic();
