import { generateId, loadApiKey } from '../spec';
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
      generateId: this.generateId,
    });
  }
}

/**
 * Default Mistral provider instance.
 */
export const mistral = new Mistral();
