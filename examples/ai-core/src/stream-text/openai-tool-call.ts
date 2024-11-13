import { openai } from '@ai-sdk/openai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';
import { streamText, tool } from 'ai';
import { z } from 'zod';

async function main() {
  const result = streamText({
    model: openai('gpt-4-turbo'),
    maxSteps: 5,
    tools: {
      currentLocation: tool({
        description: 'Get the current location.',
        parameters: z.object({}),
        execute: async () => {
          const locations = ['New York', 'London', 'Paris'];
          return {
            location: locations[Math.floor(Math.random() * locations.length)],
          };
        },
      }),
      weather: weatherTool,
    },
    prompt: 'What is the weather in my current location and in Rome?',
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.textDelta);
        break;
      }

      case 'tool-call': {
        console.log(
          `TOOL CALL ${chunk.toolName} ${JSON.stringify(chunk.args)}`,
        );
        break;
      }

      case 'tool-result': {
        console.log(
          `TOOL RESULT ${chunk.toolName} ${JSON.stringify(chunk.result)}`,
        );
        break;
      }

      case 'step-finish': {
        console.log();
        console.log();
        console.log('STEP FINISH');
        console.log('Finish reason:', chunk.finishReason);
        console.log('Usage:', chunk.usage);
        console.log();
        break;
      }

      case 'finish': {
        console.log('FINISH');
        console.log('Finish reason:', chunk.finishReason);
        console.log('Usage:', chunk.usage);
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }
}

main().catch(console.error);
