import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output, stepCountIs } from 'ai';
import { z } from 'zod';
import { print } from '../lib/print';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-haiku-4-5'),
    stopWhen: stepCountIs(20),
    output: Output.array({
      element: z.object({
        location: z.string(),
        temperature: z.number(),
        condition: z.string(),
      }),
    }),
    tools: { weather: weatherTool },
    prompt: 'What is the weather in San Francisco, London, Paris, and Berlin?',
  });

  print('Output:', result.output);
});
