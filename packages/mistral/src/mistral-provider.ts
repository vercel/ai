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
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.mistral.ai/v1`.
   */
  baseURL?: string;

  /**
@deprecated Use `baseURL` instead.
   */
  baseUrl?: string;

  /**
API key that is being send using the `Authorization` header.
It defaults to the `MISTRAL_API_KEY` environment variable.
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
  const createModel = (
    modelId: MistralChatModelId,
    settings: MistralChatSettings = {},
  ) =>
    new MistralChatLanguageModel(modelId, settings, {
      provider: 'mistral.chat',
      baseURL:
        withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
        'https://api.mistral.ai/v1',
      headers: () => ({
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'MISTRAL_API_KEY',
          description: 'Mistral',
        })}`,
        ...options.headers,
      }),
      generateId: options.generateId ?? generateId,
    });

  const provider = function (
    modelId: MistralChatModelId,
    settings?: MistralChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Mistral model function cannot be called with the new keyword.',
      );
    }

    return createModel(modelId, settings);
  };

  provider.chat = createModel;

  return provider as MistralProvider;
}

/**
Default Mistral provider instance.
 */
export const mistral = createMistral();
