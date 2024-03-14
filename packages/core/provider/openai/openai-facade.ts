import { loadApiKey } from '../../ai-model-specification/index';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { OpenAIChatSettings } from './openai-chat-settings';

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
      provider: 'openai',
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
