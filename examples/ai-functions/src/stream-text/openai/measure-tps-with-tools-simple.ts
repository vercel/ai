import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { streamTextTps } from '../../lib/stream-text-tps';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

run(async () => {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt:
      'Find my current location, get the weather there, and answer in one sentence.',
    stopWhen: stepCountIs(5),
    tools: {
      currentLocation: tool({
        description: 'Get the current location.',
        inputSchema: z.object({}),
        execute: async () => {
          await wait(200);
          return { location: 'San Francisco' };
        },
      }),
      weather: tool({
        description: 'Get the weather in a location.',
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => {
          await wait(600);
          return { location, temperature: 63, condition: 'foggy' };
        },
      }),
    },
    ...streamTextTps(),
  });

  for await (const text of result.textStream) {
    process.stdout.write(text);
  }

  console.log();
});
