import { type MoonshotAIProviderOptions, moonshotai } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    maxOutputTokens: 200,
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      moonshotai: {
        reasoningEffort: 'high',
      } satisfies MoonshotAIProviderOptions,
    },
  });

  console.log('Reasoning:', result.reasoningText);
  console.log('Response:', result.text);
});
