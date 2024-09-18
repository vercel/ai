import { mistral } from '@ai-sdk/mistral';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = await generateText({
    model: mistral('mistral-large-latest'),
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
