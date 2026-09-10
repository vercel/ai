import { xai } from '@ai-sdk/xai';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startBatch as startBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { presentImages } from '../../lib/present-image';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const provider = xai;
  const batch = await startBatch({
    provider,
    requests: [
      {
        id: 'red-panda',
        type: 'image',
        model: 'grok-imagine-image',
        prompt: 'A red panda reading beside a cabin window',
        aspectRatio: '16:9',
      },
    ],
  });

  print('Started batch:', batch);

  while ((await getBatchStatus({ provider, batch })).status === 'pending') {
    await setTimeout(10_000);
  }

  for await (const item of getBatchResults({ provider, batch })) {
    if (item.type === 'image' && item.status === 'succeeded') {
      await presentImages(item.images);
    } else if (item.status !== 'succeeded') {
      print('Error:', { id: item.id, error: item.error });
    }
  }
});
