import { anthropic } from '@ai-sdk/anthropic';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = anthropic('claude-haiku-4-5');
  const tools = {
    web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
  };
  const batch = await startTextBatch({
    model,
    tools,
    requests: [
      {
        id: 'latest-vercel-news',
        prompt:
          'Use web search to find and summarize the most recent Vercel announcement with its source.',
      },
    ],
  });
  print('Started batch:', batch);

  while ((await getBatchStatus({ model, batch })).status === 'pending') {
    await setTimeout(60_000);
  }
  for await (const item of getBatchResults({ model, batch, tools })) {
    print('Result:', item);
  }
});
