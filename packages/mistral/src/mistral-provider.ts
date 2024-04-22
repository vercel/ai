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

export interface MistralProviderSettings {
  /**
Base URL for the Mistral API calls.
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
Create a Mistral AI provider instance.
 */
export function createMistral(
  options: MistralProviderSettings = {},
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
Default Mistral provider instance.
 */
export const mistral = createMistral();
