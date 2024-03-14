import { loadApiKey } from '../../ai-model-specification/index';
import { OpenAIChatLanguageModel } from '../openai/openai-chat-language-model';
import { FireworksChatSettings } from './fireworks-chat-settings';

export function chat(
  settings: Omit<FireworksChatSettings, 'client'> & {
    baseUrl?: string;
    apiKey?: string;
  },
) {
  const { baseUrl, apiKey, ...remainingSettings } = settings;
  return new OpenAIChatLanguageModel(
    { ...remainingSettings },
    {
      provider: 'fireworks',
      baseUrl: baseUrl ?? 'https://api.fireworks.ai/inference/v1',
      apiKey: () =>
        loadApiKey({
          apiKey,
          environmentVariableName: 'FIREWORKS_API_KEY',
          description: 'FireWorks',
        }),
      mapSettings: settings => ({
        model: settings.id,
        prompt_truncate_len: settings.promptTruncateLength,
        top_k: settings.topK,
        context_length_exceeded_behavior:
          settings.contextLengthExceededBehavior,
      }),
    },
  );
}
