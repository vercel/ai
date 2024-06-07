import { google } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

dotenv.config();

async function main() {
  const result = await generateText({
    model: google('models/gemini-1.5-pro-latest'),
    maxTokens: 512,
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        parameters: z.object({ city: z.string() }),
      }),
    },
    toolChoice: {
      type: 'tool',
      toolName: 'weather',
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
