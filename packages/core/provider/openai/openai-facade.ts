import { loadApiKey } from '../../ai-model-specification';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import { OpenAICompletionSettings } from './openai-completion-settings';

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

  chat(settings: OpenAIChatSettings) {
    return new OpenAIChatLanguageModel<OpenAIChatSettings>(settings, {
      provider: 'openai.chat',
      ...this.baseConfig,
      mapSettings: settings => ({
        model: settings.id,
        logit_bias: settings.logitBias,
      }),
    });
  }

  completion(settings: OpenAICompletionSettings) {
    return new OpenAICompletionLanguageModel<OpenAICompletionSettings>(
      settings,
      {
        provider: 'openai.completion',
        ...this.baseConfig,
        mapSettings: settings => ({
          model: settings.id,
          logit_bias: settings.logitBias,
        }),
      },
    );
  }
}
