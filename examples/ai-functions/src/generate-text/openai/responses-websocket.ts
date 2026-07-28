import { openai } from '@ai-sdk/openai';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-5.6'),
    prompt: 'What is the weather in San Francisco?',
    tools: {
      weather: tool({
        description: 'Get the weather for a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({
          city,
          temperature: 72,
          unit: 'fahrenheit',
        }),
      }),
    },
    stopWhen: isStepCount(3),
    providerOptions: {
      openai: {
        transport: 'websocket',
      },
    },
  });

  console.log(result.text);
});
