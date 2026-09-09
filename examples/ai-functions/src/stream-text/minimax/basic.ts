import { minimax } from '@ai-sdk/minimax';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: minimax('minimax-m3'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  await printFullStream({ result });

  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
