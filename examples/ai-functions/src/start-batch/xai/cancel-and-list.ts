import { xai } from '@ai-sdk/xai';
import {
  experimental_cancelBatch as cancelBatch,
  experimental_getBatchStatus as getBatchStatus,
  experimental_listBatches as listBatches,
  experimental_startBatch as startBatch,
} from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const provider = xai;
  const batch = await startBatch({
    provider,
    requests: [
      {
        id: 'capital-france',
        type: 'text',
        model: 'grok-4.3',
        prompt: 'What is the capital of France?',
      },
    ],
  });

  print('Started batch:', batch);

  const page = await listBatches({ provider, limit: 20 });
  print(
    'Listed batch:',
    page.batches.find(item => item.id === batch.id),
  );
  print('Next cursor:', page.nextCursor);

  await cancelBatch({ provider, batch });
  print('Cancellation requested for:', batch.id);

  const status = await getBatchStatus({ provider, batch });
  print('Batch status:', status);
});
