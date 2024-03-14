import { loadApiKey } from '../../ai-model-specification/index';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatSettings } from './openai-chat-settings';
import { OpenAICompletionLanguageModel } from './openai-completion-language-model';
import { OpenAICompletionSettings } from './openai-completion-settings';

export function chat(
  settings: OpenAIChatSettings & {
    baseUrl?: string;
    apiKey?: string;
  },
) {
  const { baseUrl, apiKey, ...remainingSettings } = settings;
  return new OpenAIChatLanguageModel<OpenAIChatSettings>(
    { ...remainingSettings },
    {
      provider: 'openai.chat',
      baseUrl: baseUrl ?? 'https://api.openai.com/v1',
      apiKey: () =>
        loadApiKey({
          apiKey,
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

export function completion(
  settings: OpenAICompletionSettings & {
    baseUrl?: string;
    apiKey?: string;
  },
) {
  const { baseUrl, apiKey, ...remainingSettings } = settings;
  return new OpenAICompletionLanguageModel<OpenAICompletionSettings>(
    { ...remainingSettings },
    {
      provider: 'openai.completion',
      baseUrl: baseUrl ?? 'https://api.openai.com/v1',
      apiKey: () =>
        loadApiKey({
          apiKey,
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
