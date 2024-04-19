import { MistralChatLanguageModel } from './mistral-chat-language-model';
import {
  MistralChatModelId,
  MistralChatSettings,
} from './mistral-chat-settings';
import { Mistral } from './mistral-facade';

export interface MistralProvider {
  (
    modelId: MistralChatModelId,
    settings?: MistralChatSettings,
  ): MistralChatLanguageModel;

  chat(
    modelId: MistralChatModelId,
    settings?: MistralChatSettings,
  ): MistralChatLanguageModel;
}

/**
 * Create a Mistral AI provider.
 */
export function createMistral(
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
): MistralProvider {
  const mistral = new Mistral(options);

  const provider = function (
    modelId: MistralChatModelId,
    settings?: MistralChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Mistral model function cannot be called with the new keyword.',
      );
    }

    return mistral.chat(modelId, settings);
  };

  provider.chat = mistral.chat.bind(mistral);

  return provider as MistralProvider;
}

/**
 * Default Mistral provider instance.
 */
export const mistral = createMistral();
