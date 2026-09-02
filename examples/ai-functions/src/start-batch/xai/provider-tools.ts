import { xai } from '@ai-sdk/xai';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startBatch as startBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const provider = xai;
  const model = 'grok-4.3';
  const tools = {
    web_search: xai.tools.webSearch(),
  };
  const batch = await startBatch({
    provider,
    requests: [
      {
        id: 'latest-vercel-news',
        type: 'text',
        model,
        tools,
        prompt:
          'Search the web and summarize the most recent Vercel announcement with its source.',
      },
    ],
  });
  print('Started batch:', batch);

  while ((await getBatchStatus({ provider, batch })).status === 'pending') {
    await setTimeout(10_000);
  }
  for await (const item of getBatchResults({ provider, batch, tools })) {
    print('Result:', item);
  }
});
