import OpenAI from 'openai';
import { loadApiKey } from '../../core/language-model/load-api-key';
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
        max_tokens: settings.maxTokens,
        prompt_truncate_len: settings.promptTruncateLength,
        temperature: settings.temperature,
        top_p: settings.topP,
        top_k: settings.topK,
        presence_penalty: settings.presencePenalty,
        frequency_penalty: settings.frequencyPenalty,
        context_length_exceeded_behavior:
          settings.contextLengthExceededBehavior,

        objectMode: settings.objectMode,
      }),
    },
  );
}
