import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import {
  OpenAICompletionModelId,
  OpenAICompletionSettings,
} from './openai-completion-settings';

/**
 * OpenAI provider.
 */
export class OpenAI {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly organization?: string;

  constructor(
    options: { baseUrl?: string; apiKey?: string; organization?: string } = {},
  ) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.organization = options.organization;
  }

  private get baseConfig() {
    return {
      organization: this.organization,
      baseUrl: this.baseUrl ?? 'https://api.openai.com/v1',
      headers: () => ({
        Authorization: `Bearer ${loadApiKey({
          apiKey: this.apiKey,
          environmentVariableName: 'OPENAI_API_KEY',
          description: 'OpenAI',
        })}`,
        'OpenAI-Organization': this.organization,
      }),
    };
  }

  chat(modelId: OpenAIChatModelId, settings: OpenAIChatSettings = {}) {
    return new OpenAIChatLanguageModel(modelId, settings, {
      provider: 'openai.chat',
      ...this.baseConfig,
    });
  }

  completion(
    modelId: OpenAICompletionModelId,
    settings: OpenAICompletionSettings = {},
  ) {
    return new OpenAICompletionLanguageModel(modelId, settings, {
      provider: 'openai.completion',
      ...this.baseConfig,
    });
  }
}

/**
 * Default OpenAI provider instance.
 */
export const openai = new OpenAI();
