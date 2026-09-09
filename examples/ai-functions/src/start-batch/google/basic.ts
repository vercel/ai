import { google } from '@ai-sdk/google';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startBatch as startBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const provider = google;
  const model = 'gemini-3.6-flash';

  const batch = await startBatch({
    provider,
    requests: [
      {
        id: 'capital-france',
        type: 'text',
        model,
        prompt: 'What is the capital of France?',
      },
      {
        id: 'capital-germany',
        type: 'text',
        model,
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

    await setTimeout(10_000);
  }

  for await (const item of getBatchResults({ provider, batch })) {
    if (item.status === 'succeeded') {
      print('Result:', { id: item.id, text: item.text });
    } else {
      print('Error:', { id: item.id, error: item.error });
    }
  }
});
