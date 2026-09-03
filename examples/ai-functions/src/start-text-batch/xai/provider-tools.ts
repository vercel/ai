import { xai } from '@ai-sdk/xai';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = xai('grok-4.3');
  const tools = {
    web_search: xai.tools.webSearch(),
  };
  const batch = await startTextBatch({
    model,
    tools,
    requests: [
      {
        id: 'latest-vercel-news',
        prompt:
          'Search the web and summarize the most recent Vercel announcement with its source.',
      },
    ],
  });
  print('Started batch:', batch);

  while ((await getBatchStatus({ model, batch })).status === 'pending') {
    await setTimeout(10_000);
  }
  for await (const item of getBatchResults({ model, batch, tools })) {
    print('Result:', item);
  }
});
