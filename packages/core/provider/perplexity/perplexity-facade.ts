import OpenAI from 'openai';
import { loadApiKey } from '../../core/language-model/load-api-key';
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
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
        top_p: settings.topP,
        top_k: settings.topK,
        presence_penalty: settings.presencePenalty,
        frequency_penalty: settings.frequencyPenalty,

        objectMode: undefined,
      }),
    },
  );
}
