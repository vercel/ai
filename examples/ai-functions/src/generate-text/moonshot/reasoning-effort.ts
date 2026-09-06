import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    maxOutputTokens: 200,
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      moonshotai: {
        reasoningEffort: 'high',
      } satisfies MoonshotAILanguageModelOptions,
    },
  });

  print('Reasoning:', result.reasoningText);
  print('Response:', result.text);
});
