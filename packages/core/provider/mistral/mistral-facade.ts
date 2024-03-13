import MistralClient from '@mistralai/mistralai';
import { loadApiKey } from '../../ai-model-specification/index';
import { createMistralClient } from './create-mistral-client';
import { MistralChatLanguageModel } from './mistral-chat-language-model';
import { MistralChatSettings } from './mistral-chat-settings';

export function chat(
  settings: Omit<MistralChatSettings, 'client'> & {
    client?: MistralClient;
    apiKey?: string;
  },
) {
  const { client, apiKey, ...remainingSettings } = settings;
  return new MistralChatLanguageModel(
    { ...remainingSettings },
    {
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
    },
  );
}
