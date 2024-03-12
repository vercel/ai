import OpenAI from 'openai';
import { loadApiKey } from '../../core/language-model/util/load-api-key';
import { createOpenAIClient } from '../openai/create-openai-client';
import { OpenAIChatLanguageModel } from '../openai/openai-chat-language-model';
import { PerplexityChatSettings } from './perplexity-chat-settings';

export function chat(
  settings: PerplexityChatSettings & {
    client?: OpenAI;
    apiKey?: string;
  },
) {
  const { client, apiKey, ...remainingSettings } = settings;
  return new OpenAIChatLanguageModel(
    { ...remainingSettings },
    {
      client: async () => {
        if (client) {
          return client;
        }

        return createOpenAIClient({
          apiKey: loadApiKey({
            apiKey,
            environmentVariableName: 'PERPLEXITY_API_KEY',
            description: 'Perplexity',
          }),
          baseURL: 'https://api.perplexity.ai/',
        });
      },

      mapSettings: settings => ({
        model: settings.id,
        top_k: settings.topK,
      }),
    },
  );
}
