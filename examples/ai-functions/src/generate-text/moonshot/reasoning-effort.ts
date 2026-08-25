import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    prompt: 'Prove that the square root of 2 is irrational.',
    providerOptions: {
      moonshotai: {
        reasoningEffort: 'max',
      } satisfies MoonshotAILanguageModelOptions,
    },
  });

  console.log(result.reasoningText);
  console.log(result.text);
});
