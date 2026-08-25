import { moonshotai } from '@ai-sdk/moonshotai';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: moonshotai('kimi-k2.7-code'),
    prompt:
      'Implement a stable merge sort in TypeScript and explain its complexity.',
  });

  // K2.7 thinking and preserved reasoning are always enabled. Do not send
  // thinking or reasoningEffort provider options.
  await printFullStream({ result });

  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
