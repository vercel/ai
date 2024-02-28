import OpenAI from 'openai';
import {
  OpenAIChatLanguageModel,
  OpenAIChatLanguageModelSettings,
} from '../openai/openai-chat-language-model';
import { createOpenAIClient } from '../openai/create-openai-client';
import { loadApiKey } from '../../core/language-model/load-api-key';

export function chat(
  settings: Omit<OpenAIChatLanguageModelSettings, 'client'> & {
    client?: OpenAI;
    apiKey?: string;
  },
) {
  const { client, apiKey, ...rest } = settings;
  return new OpenAIChatLanguageModel({
    ...rest,
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
  });
}
