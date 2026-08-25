import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('moonshot-v1-8k'),
    prompt: 'Invent a short name for a new holiday.',
    providerOptions: {
      moonshotai: {
        topLogprobs: 3,
      } satisfies MoonshotAILanguageModelOptions,
    },
  });

  console.log(result.text);
  console.log(result.providerMetadata?.moonshotai.logprobs);
});
