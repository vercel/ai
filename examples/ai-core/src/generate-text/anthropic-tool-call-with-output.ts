import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    stopWhen: stepCountIs(3),
    output: Output.object({
      schema: z.object({
        weather: z.object({
          location: z.string(),
          temperature: z.number(),
        }),
        attractions: z.array(z.string()),
        summary: z.string(),
      }),
    }),
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async () => ['Golden Gate Bridge', 'Alcatraz Island'],
      }),
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
  });

  console.log(JSON.stringify(result.output, null, 2));
});
