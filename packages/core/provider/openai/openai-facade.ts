import OpenAI from 'openai';
import { OpenAIChatLanguageModel } from './openai-chat-language-model';
import { createOpenAIClient } from './create-openai-client';
import { loadApiKey } from '../../core/language-model/load-api-key';
import { OpenAIChatSettings } from './openai-chat-settings';

export function chat(
  settings: OpenAIChatSettings & {
    client?: OpenAI;
    apiKey?: string;
  },
) {
  const { client, apiKey, ...remainingSettings } = settings;
  return new OpenAIChatLanguageModel<OpenAIChatSettings>(
    { ...remainingSettings },
    {
      client: async () => {
        if (client) {
          return client;
        }

        return createOpenAIClient({
          apiKey: loadApiKey({
            apiKey,
            environmentVariableName: 'OPENAI_API_KEY',
            description: 'OpenAI',
          }),
        });
      },

      mapSettings: settings => ({
        model: settings.id,
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
        top_p: settings.topP,
        seed: settings.seed,
        presence_penalty: settings.presencePenalty,
        frequency_penalty: settings.frequencyPenalty,
        logit_bias: settings.logitBias,

        objectMode: settings.objectMode,
      }),
    },
  );
}
