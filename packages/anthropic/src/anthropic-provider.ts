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

/**
 * Create an Anthropic provider.
 */
export function createAnthropic(
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
 * Default Anthropic provider instance.
 */
export const anthropic = createAnthropic();
