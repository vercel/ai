import { loadApiKey } from '../../ai-model-specification/index';
import { OpenAIChatLanguageModel } from '../openai/openai-chat-language-model';
import { PerplexityChatSettings } from './perplexity-chat-settings';

export function chat(
  settings: PerplexityChatSettings & {
    baseUrl?: string;
    apiKey?: string;
  },
) {
  const { baseUrl, apiKey, ...remainingSettings } = settings;
  return new OpenAIChatLanguageModel(
    { ...remainingSettings },
    {
      provider: 'perplexity',
      baseUrl: baseUrl ?? 'https://api.perplexity.ai',
      apiKey: () =>
        loadApiKey({
          apiKey,
          environmentVariableName: 'PERPLEXITY_API_KEY',
          description: 'Perplexity',
        }),
      mapSettings: settings => ({
        model: settings.id,
        top_k: settings.topK,
      }),
    },
  );
}
