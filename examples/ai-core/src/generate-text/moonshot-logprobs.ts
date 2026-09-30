import { moonshotai, type MoonshotAIProviderOptions } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('moonshot-v1-8k'),
    prompt: 'Reply with one word that means happy.',
    providerOptions: {
      moonshotai: {
        topLogprobs: 3,
      } satisfies MoonshotAIProviderOptions,
    },
  });

  console.log(result.text);
  console.dir(result.providerMetadata?.moonshotai.logprobs, { depth: null });
});
