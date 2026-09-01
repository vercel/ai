import { anthropic } from '@ai-sdk/anthropic';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const provider = anthropic;
  const model = 'claude-haiku-4-5';

  const batch = await startTextBatch({
    provider,
    model,
    requests: [
      {
        id: 'capital-france',
        prompt: 'What is the capital of France?',
      },
      {
        id: 'capital-germany',
        model: 'claude-sonnet-4-5',
        prompt: 'What is the capital of Germany?',
      },
    ],
  });

  print('Started batch:', batch);

  while (true) {
    const { status } = await getBatchStatus({ provider, batch });
    print('Batch status:', status);

    if (status !== 'pending') {
      break;
    }

    await setTimeout(60_000);
  }

  for await (const item of getBatchResults({ provider, batch })) {
    if (item.status === 'succeeded') {
      print('Result:', { id: item.id, text: item.text });
    } else {
      print('Error:', { id: item.id, error: item.error });
    }
  }
});
