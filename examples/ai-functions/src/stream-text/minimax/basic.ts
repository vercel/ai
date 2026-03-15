import { minimax } from '@ai-sdk/minimax';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: minimax('MiniMax-M2.5'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  printFullStream({ result });
});
