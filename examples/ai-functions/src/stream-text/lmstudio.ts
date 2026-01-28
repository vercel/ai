import { createOpenResponses } from '@ai-sdk/open-responses';
import { streamText } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';

const lmstudio = createOpenResponses({
  name: 'lmstudio',
  url: 'http://localhost:1234/v1/responses',
});

run(async () => {
  const result = streamText({
    model: lmstudio('gemma-7b-it'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxRetries: 1,
  });

  printFullStream({ result });
});
