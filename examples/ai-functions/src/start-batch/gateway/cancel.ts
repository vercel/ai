import { gateway } from '@ai-sdk/gateway';
import {
  experimental_cancelBatch as cancelBatch,
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const id = process.argv[2];
  if (!id) {
    throw new Error('Pass an existing Gateway batch ID to cancel.');
  }
  const batch = {
    version: 2,
    id,
    provider: gateway.experimental_batch().provider,
  } as const;
  print(
    'Cancellation acknowledgement:',
    await cancelBatch({ provider: gateway, batch }),
  );

  const deadline = Date.now() + 60 * 60 * 1000;
  for (;;) {
    const status = await getBatchStatus({ provider: gateway, batch });
    print('Batch status:', status);
    if (status.status !== 'pending') break;
    if (Date.now() >= deadline) {
      throw new Error(
        `Stopped polling ${id}; cancellation is not yet confirmed. Check this batch again later.`,
      );
    }
    await setTimeout(15_000);
  }

  // Successful requests remain billable even when other items were cancelled.
  for await (const item of getBatchResults({ provider: gateway, batch })) {
    print('Result:', item);
  }
});
