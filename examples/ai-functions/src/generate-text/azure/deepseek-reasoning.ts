import {
  createAzure,
  type AzureDeepSeekLanguageModelOptions,
} from '@ai-sdk/azure';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

const azure = createAzure({
  baseURL: 'https://jeril-mkrr6dri-eastus2.cognitiveservices.azure.com/openai',
});

run(async () => {
  const result = await generateText({
    model: azure.deepseek('deepseek-v4-pro'),
    prompt:
      'Can you please invent a new holiday around the latest Knicks game?',
    providerOptions: {
      azure: {
        reasoningEffort: 'high',
      } satisfies AzureDeepSeekLanguageModelOptions,
    },
  });

  print('Reasoning:', result.reasoningText);
  print('Text:', result.text);
});
