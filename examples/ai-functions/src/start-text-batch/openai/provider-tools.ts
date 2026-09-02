import { openai } from '@ai-sdk/openai';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = openai('gpt-5-mini');
  const tools = {
    web_search: openai.tools.webSearch({
      searchContextSize: 'low',
    }),
  };

  const batch = await startTextBatch({
    model,
    tools,
    toolChoice: { type: 'tool', toolName: 'web_search' },
    requests: [
      {
        id: 'latest-vercel-news',
        prompt:
          'Search the web for the latest Vercel news and summarize the most recent announcement with its source.',
      },
    ],
  });

  print('Started batch:', batch);

  while (true) {
    const { status } = await getBatchStatus({ model, batch });
    print('Batch status:', status);

    if (status !== 'pending') break;
    await setTimeout(10_000);
  }

  for await (const item of getBatchResults({ model, batch, tools })) {
    print('Result:', item);
  }
});
