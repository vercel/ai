import OpenAI from 'openai';
import { loadApiKey } from '../../core/language-model/util/load-api-key';
import { createOpenAIClient } from '../openai/create-openai-client';
import { OpenAIChatLanguageModel } from '../openai/openai-chat-language-model';
import { FireworksChatSettings } from './fireworks-chat-settings';

export function chat(
  settings: Omit<FireworksChatSettings, 'client'> & {
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
            environmentVariableName: 'FIREWORKS_API_KEY',
            description: 'FireWorks',
          }),
          baseURL: 'https://api.fireworks.ai/inference/v1',
        });
      },

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
