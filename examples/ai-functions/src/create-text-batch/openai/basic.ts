import { openai } from '@ai-sdk/openai';
import {
  experimental_createTextBatch as createTextBatch,
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = openai('gpt-5.6');

  const batch = await createTextBatch({
    model,
    requests: [
      {
        id: 'capital-france',
        prompt: 'What is the capital of France?',
      },
      {
        id: 'capital-germany',
        prompt: 'What is the capital of Germany?',
      },
    ],
  });

  print('Created batch:', batch);

  while (true) {
    const { status } = await getBatchStatus({ model, batch });
    print('Batch status:', status);

    if (status !== 'pending') {
      break;
    }

    await setTimeout(60_000);
  }

  for await (const result of getBatchResults({ model, batch })) {
    print('Result:', result);
  }
});
