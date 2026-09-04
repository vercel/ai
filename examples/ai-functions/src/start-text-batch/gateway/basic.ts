import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = 'anthropic/claude-haiku-4-5';

  const batch = await startTextBatch({
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

  print('Started batch:', batch);

  while (true) {
    const { status } = await getBatchStatus({ model, batch });
    print('Batch status:', status);

    if (status !== 'pending') {
      break;
    }

    await setTimeout(10_000);
  }

  for await (const item of getBatchResults({ model, batch })) {
    if (item.status === 'succeeded') {
      print('Result:', { id: item.id, text: item.text });
    } else {
      print('Error:', { id: item.id, error: item.error });
    }
  }
});
