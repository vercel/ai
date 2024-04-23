import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import {
  OpenAICompletionModelId,
  OpenAICompletionSettings,
} from './openai-completion-settings';
import { OpenAIProviderSettings } from './openai-provider';

/**
@deprecated Use `createOpenAI` instead.
 */
export class OpenAI {
  /**
Base URL for the OpenAI API calls.
   */
  readonly baseURL: string;

  readonly apiKey?: string;

  /**
OpenAI Organization.
   */
  readonly organization?: string;

  /**
OpenAI project.
   */
  readonly project?: string;

  /**
Custom headers to include in the requests.
   */
  readonly headers?: Record<string, string>;

  /**
   * Creates a new OpenAI provider instance.
   */
  constructor(options: OpenAIProviderSettings = {}) {
    this.baseURL =
      withoutTrailingSlash(options.baseURL ?? options.baseUrl) ??
      'https://api.openai.com/v1';
    this.apiKey = options.apiKey;
    this.organization = options.organization;
    this.project = options.project;
    this.headers = options.headers;
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
        'OpenAI-Project': this.project,
        ...this.headers,
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
