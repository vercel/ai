import { openai } from '@ai-sdk/openai';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
  tool,
} from 'ai';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const model = openai('gpt-4.1-nano');
  let executeCallCount = 0;

  const tools = {
    get_weather: tool({
      description: 'Get the current weather for a location.',
      inputSchema: z.object({
        location: z.string().describe('The city and country.'),
      }),
      execute: async ({ location }) => {
        executeCallCount++;
        return { location, temperature: 21, condition: 'sunny' };
      },
    }),
  };

  const batch = await startTextBatch({
    model,
    tools,
    toolChoice: { type: 'tool', toolName: 'get_weather' },
    requests: [
      {
        id: 'weather-san-francisco',
        prompt:
          'Call get_weather for San Francisco, California. Do not answer from your own knowledge.',
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

  if (executeCallCount !== 0) {
    throw new Error('Batch processing unexpectedly executed a client tool.');
  }

  print('Client tool execute calls:', executeCallCount);
});
