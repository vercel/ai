import MistralClient from '@mistralai/mistralai';
import {
  MistralChatLanguageModel,
  MistralChatLanguageModelSettings,
} from './mistral-chat-language-model';
import { createMistralClient } from './create-mistral-client';
import { loadApiKey } from '../../core/language-model/load-api-key';

export function chat(
  settings: Omit<MistralChatLanguageModelSettings, 'client'> & {
    client?: MistralClient;
    apiKey?: string;
  },
) {
  const { client, apiKey, ...rest } = settings;
  return new MistralChatLanguageModel({
    ...rest,
    client: async () => {
      if (client) {
        return client;
      }

      return createMistralClient({
        apiKey: loadApiKey({
          apiKey,
          environmentVariableName: 'MISTRAL_API_KEY',
          description: 'Mistral',
        }),
      });
    },
  });
}
