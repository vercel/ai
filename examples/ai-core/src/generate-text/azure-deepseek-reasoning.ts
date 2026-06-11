import { azure, type AzureDeepSeekLanguageModelOptions } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: azure.deepseek('deepseek-v4-pro'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      azure: {
        reasoningEffort: 'high',
      } satisfies AzureDeepSeekLanguageModelOptions,
    },
  });

  print('Reasoning:', result.reasoningText);
  print('Response:', result.text);
  print('Request:', result.request.body);
});
