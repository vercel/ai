import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';
import { print } from '../lib/print';
import { z } from 'zod';

run(async () => {
  const result = streamText({
    model: openai('gpt-3.5-turbo'),
    prompt: 'Get the weather for Paris, London, and Tokyo, then summarize.',
    tools: {
      getWeather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          if (location === 'London')
            await new Promise(r => setTimeout(r, 5000));
          return {
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10,
            condition: 'sunny',
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
    timeout: {
      totalMs: 30000,
      stepMs: 3000,
    },
  });

  printFullStream({ result });

  print('Usage:', await result.usage);
  print('Finish reason', await result.finishReason);
});
