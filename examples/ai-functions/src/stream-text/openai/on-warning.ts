import { openai } from '@ai-sdk/openai';
import { isStepCount, streamText, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: openai('gpt-6.2-sol'),
    seed: 42,
    stopWhen: isStepCount(3),
    tools: {
      weather: tool({
        description: 'Get the weather in a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({ city, temperature: 21 }),
      }),
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe the image in one sentence, then get the weather in Paris.',
          },
          { type: 'image', image: fs.readFileSync('./data/comic-cat.png') },
        ],
      },
    ],
    onWarning: ({ warnings, provider, model }) => {
      console.log('onWarning:', { provider, model, warnings });
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'start-step') {
      console.log('start-step warnings:', part.warnings);
    }
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
    if (part.type === 'text-end') {
      console.log();
    }
  }

  console.log('result warnings:', await result.warnings);
});
