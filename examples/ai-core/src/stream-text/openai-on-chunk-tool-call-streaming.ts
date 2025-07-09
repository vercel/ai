import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = streamText({
    model: openai('gpt-3.5-turbo'),
    tools: {
      weather: weatherTool,
      cityAttractions: {
        inputSchema: z.object({ city: z.string() }),
      },
    },
    onChunk(chunk) {
      console.log('onChunk', chunk);
    },
    prompt: 'What is the weather in San Francisco?',
  });

  // consume stream:
  for await (const textPart of result.textStream) {
  }
}

main().catch(console.error);
