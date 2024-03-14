import { loadApiKey } from '../../ai-model-specification';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import { OpenAICompletionSettings } from './openai-completion-settings';

export class OpenAI {
  readonly baseUrl?: string;
  readonly apiKey?: string;

  constructor({ baseUrl, apiKey }: { baseUrl?: string; apiKey?: string } = {}) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  chat(settings: OpenAIChatSettings) {
    return new OpenAIChatLanguageModel<OpenAIChatSettings>(settings, {
      provider: 'openai.chat',
      baseUrl: this.baseUrl ?? 'https://api.openai.com/v1',
      apiKey: () =>
        loadApiKey({
          apiKey: this.apiKey,
          environmentVariableName: 'OPENAI_API_KEY',
          description: 'OpenAI',
        }),
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
        baseUrl: this.baseUrl ?? 'https://api.openai.com/v1',
        apiKey: () =>
          loadApiKey({
            apiKey: this.apiKey,
            environmentVariableName: 'OPENAI_API_KEY',
            description: 'OpenAI',
          }),
        mapSettings: settings => ({
          model: settings.id,
          logit_bias: settings.logitBias,
        }),
      },
    );
  }
}
