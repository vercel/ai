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
import { MistralProviderSettings } from './mistral-provider';

/**
 * @deprecated Use `createMistral` instead.
 */
export class Mistral {
  /**
   * Base URL for the Mistral API calls.
   */
  readonly baseURL: string;

  readonly apiKey?: string;

  readonly headers?: Record<string, string>;

  private readonly generateId: () => string;

  /**
   * Creates a new Mistral provider instance.
   */
  constructor(options: MistralProviderSettings = {}) {
    this.baseURL =
      withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
      'https://api.mistral.ai/v1';

    this.apiKey = options.apiKey;
    this.headers = options.headers;
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
        ...this.headers,
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
