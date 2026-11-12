import { inception } from '@ai-sdk/inception';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: inception('mercury-3'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  await printFullStream({ result });
});
