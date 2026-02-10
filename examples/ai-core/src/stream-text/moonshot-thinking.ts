import { moonshotai } from '@ai-sdk/moonshotai';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: moonshotai('kimi-k2-thinking'),
    prompt:
      'Solve this problem step by step: If a train travels 120 miles in 2 hours, how far will it travel in 5 hours at the same speed?',
    providerOptions: {
      moonshotai: {
        thinking: {
          type: 'enabled',
          budgetTokens: 2048,
        },
        reasoningHistory: 'interleaved',
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(`\x1b[34m${part.text}\x1b[0m`);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
