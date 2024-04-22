import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import {
  OpenAICompletionModelId,
  OpenAICompletionSettings,
} from './openai-completion-settings';

/**
 * @deprecated Use `createOpenAI` instead.
 */
export class OpenAI {
  /**
   * Base URL for the OpenAI API calls.
   */
  readonly baseURL: string;

  readonly apiKey?: string;
  readonly organization?: string;

  /**
   * Creates a new OpenAI provider instance.
   */
  constructor(
    options: {
      /**
       * Base URL for the OpenAI API calls.
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

      /**
       * Organization ID.
       */
      organization?: string;
    } = {},
  ) {
    this.baseURL =
      withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
      'https://api.openai.com/v1';
    this.apiKey = options.apiKey;
    this.organization = options.organization;
  }

  private get baseConfig() {
    return {
      organization: this.organization,
      baseURL: this.baseURL,
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
