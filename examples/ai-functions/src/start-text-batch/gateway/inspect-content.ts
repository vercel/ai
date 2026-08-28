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
        prompt: 'What is the capital of France? Answer in one sentence.',
      },
    ],
  });

  while ((await getBatchStatus({ model, batch })).status === 'pending') {
    await setTimeout(10_000);
  }

  for await (const item of getBatchResults({ model, batch })) {
    if (item.status !== 'succeeded') {
      print('Error:', item);
      continue;
    }

    print('Text projection:', item.text);
    print('Ordered content:', item.content);

    for (const part of item.content) {
      if (part.type === 'text') {
        print('Text part:', part.text);
      } else if (part.type === 'reasoning') {
        print('Reasoning part:', part.text);
      }
    }
  }
});
