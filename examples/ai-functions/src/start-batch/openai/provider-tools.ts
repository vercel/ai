import { openai } from '@ai-sdk/openai';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startBatch as startBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const provider = openai;
  const model = 'gpt-5-mini';
  const tools = {
    web_search: openai.tools.webSearch({
      searchContextSize: 'low',
    }),
  };

  const batch = await startBatch({
    provider,
    requests: [
      {
        id: 'latest-vercel-news',
        type: 'text',
        model,
        tools,
        toolChoice: { type: 'tool', toolName: 'web_search' },
        prompt:
          'Search the web for the latest Vercel news and summarize the most recent announcement with its source.',
      },
    ],
  });

  print('Started batch:', batch);

  while (true) {
    const { status } = await getBatchStatus({ provider, batch });
    print('Batch status:', status);

    if (status !== 'pending') break;
    await setTimeout(10_000);
  }

  for await (const item of getBatchResults({ provider, batch, tools })) {
    print('Result:', item);
  }
});
