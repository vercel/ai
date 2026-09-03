import { google } from '@ai-sdk/google';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = google('gemini-3.6-flash');
  const tools = {
    google_search: google.tools.googleSearch({}),
  };
  const batch = await startTextBatch({
    model,
    tools,
    requests: [
      {
        id: 'latest-vercel-news',
        prompt:
          'Use Google Search to find and summarize the most recent Vercel announcement with its source.',
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
