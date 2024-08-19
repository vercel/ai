import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import dotenv from 'dotenv';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

dotenv.config();

async function main() {
  const result = await streamText({
    model: openai('gpt-3.5-turbo'),
    tools: {
      weather: weatherTool,
      cityAttractions: {
        parameters: z.object({ city: z.string() }),
      },
    },
    experimental_toolCallStreaming: true,
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
