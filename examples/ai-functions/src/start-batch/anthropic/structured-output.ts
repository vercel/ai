import { anthropic } from '@ai-sdk/anthropic';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startBatch as startBatch,
  Output,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const provider = anthropic;
  const model = 'claude-haiku-5-5';

  const output = Output.object({
    schema: z.object({
      translations: z.array(
        z.object({ id: z.number().int(), translation: z.string() }),
      ),
    }),
  });

  const batch = await startBatch({
    provider,
    requests: [
      {
        id: 'translate-1',
        type: 'text',
        model,
        system: 'Translate each item into English.',
        prompt: JSON.stringify([{ id: 0, title: 'Directeur commercial' }]),
        output,
      },
      {
        id: 'translate-2',
        type: 'text',
        model,
        system: 'Translate each item into English.',
        prompt: JSON.stringify([{ id: 0, title: 'Ingeniero de software' }]),
        output,
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

  for await (const item of getBatchResults({ provider, batch, output })) {
    if (item.type !== 'text') {
      continue;
    }

    if (item.status !== 'succeeded') {
      print('Error:', { id: item.id, error: item.error });
    } else if (item.outputError != null) {
      // the raw text is still available, e.g. to resubmit the request
      print('Invalid output:', {
        id: item.id,
        error: item.outputError,
        text: item.text,
      });
    } else {
      print('Output:', { id: item.id, output: item.output });
    }
  }
});
