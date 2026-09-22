import { anthropic } from '@ai-sdk/anthropic';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startBatch as startBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const provider = anthropic;
  const model = 'claude-haiku-4-5';
  const tools = {
    web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }),
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
          'Use web search to find and summarize the most recent Vercel announcement with its source.',
      },
    ],
  });
  print('Started batch:', batch);

  while ((await getBatchStatus({ provider, batch })).status === 'pending') {
    await setTimeout(60_000);
  }
  for await (const item of getBatchResults({ provider, batch, tools })) {
    print('Result:', item);
  }
});
