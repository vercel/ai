import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startBatch as startBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = 'anthropic/claude-sonnet-5';

  const batch = await startBatch({
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
    const { status } = await getBatchStatus({ batch });
    print('Batch status:', status);

    if (status !== 'pending') {
      break;
    }

    await setTimeout(10_000);
  }

  for await (const item of getBatchResults({ batch })) {
    if (item.status === 'succeeded') {
      print('Result:', { id: item.id, text: item.text });
    } else {
      print('Error:', { id: item.id, error: item.error });
    }
  }
});
