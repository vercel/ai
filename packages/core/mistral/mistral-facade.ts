import { loadApiKey } from '../ai-model-specification';
import { MistralChatLanguageModel } from './mistral-chat-language-model';
import {
  MistralChatModelId,
  MistralChatSettings,
} from './mistral-chat-settings';

/**
 * Mistral provider.
 */
export class Mistral {
  readonly baseUrl?: string;
  readonly apiKey?: string;

  constructor(
    options: { baseUrl?: string; apiKey?: string; organization?: string } = {},
  ) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
  }

  private get baseConfig() {
    return {
      baseUrl: this.baseUrl ?? 'https://api.mistral.ai/v1',
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
    });
  }
}

/**
 * Default Mistral provider instance.
 */
export const mistral = new Mistral();
