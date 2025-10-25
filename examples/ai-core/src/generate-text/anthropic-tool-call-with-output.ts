import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    stopWhen: stepCountIs(2),
    output: Output.object({
      schema: z.object({
        weather: z.object({
          location: z.string(),
          temperature: z.number(),
        }),
      }),
    }),
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.log(JSON.stringify(result.steps, null, 2));
}

main().catch(console.error);
