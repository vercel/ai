import { createOpenResponses } from '@ai-sdk/open-responses';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

const lmstudio = createOpenResponses({
  name: 'lmstudio',
  url: 'http://localhost:1234/v1/responses',
});

run(async () => {
  const result = streamText({
    model: lmstudio('gemma-7b-it'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxRetries: 1,
    includeRawChunks: true,
  });

  await saveRawChunks({
    result,
    filename: 'lmstudio-gemma-7b-it',
  })
});
