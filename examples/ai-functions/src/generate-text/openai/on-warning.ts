import { openai } from '@ai-sdk/openai';
import { generateText, isStepCount, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
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

  console.log(result.text);
  console.log(
    'step warnings:',
    result.steps.map(step => step.warnings),
  );
});
