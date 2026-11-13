import { anthropic } from '@ai-sdk/anthropic';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-5-5'),
    stopWhen: isStepCount(5),
    tools: {
      weather: tool({
        description: 'Get the weather for a city or for coordinates',
        inputSchema: z.discriminatedUnion('type', [
          z.object({ type: z.literal('city'), name: z.string() }),
          z.object({
            type: z.literal('coordinates'),
            latitude: z.number(),
            longitude: z.number(),
          }),
        ]),
        execute: async location => ({
          location,
          condition: 'sunny',
          temperature: 22,
        }),
      }),
    },
    prompt:
      'What is the weather in Paris, and at latitude 40.71 and longitude -74.01?',
  });

  await printFullStream({ result });
});
