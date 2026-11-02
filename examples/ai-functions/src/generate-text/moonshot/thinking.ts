import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k2.6'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      moonshotai: {
        thinking: { type: 'enabled' },
        reasoningHistory: 'preserved',
      } satisfies MoonshotAILanguageModelOptions,
    },
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
