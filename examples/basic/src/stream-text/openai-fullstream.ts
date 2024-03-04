import { streamText } from 'ai/core';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

dotenv.config();

async function main() {
  const result = await streamText({
    model: openai.chat({ id: 'gpt-3.5-turbo' }),
    tools: {
      weather: weatherTool,
      cityAttractions: {
        parameters: z.object({ city: z.string() }),
      },
    },
    prompt: 'What is the weather in San Francisco?',
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        console.log('Text delta:', part.textDelta);
        break;
      }

      case 'tool-call': {
        switch (part.toolName) {
          case 'cityAttractions': {
            console.log('TOOL CALL cityAttractions');
            console.log(`city: ${part.args.city}`); // string
            break;
          }

          case 'weather': {
            console.log('TOOL CALL weather');
            console.log(`location: ${part.args.location}`); // string
            break;
          }
        }

        break;
      }

      case 'tool-result': {
        console.log('Tool result:', part);
        break;
      }

      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }
}

main();
