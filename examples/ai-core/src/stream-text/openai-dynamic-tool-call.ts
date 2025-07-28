import { openai } from '@ai-sdk/openai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';
import { stepCountIs, streamText, dynamicTool } from 'ai';
import { z } from 'zod/v4';

async function main() {
  const result = streamText({
    model: openai('gpt-4-turbo'),
    stopWhen: stepCountIs(5),
    tools: {
      currentLocation: dynamicTool({
        description: 'Get the current location.',
        inputSchema: z.object({}),
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
        process.stdout.write(chunk.text);
        break;
      }

      case 'tool-call': {
        console.log(
          `TOOL CALL ${chunk.toolName} ${JSON.stringify(chunk.input)}`,
        );
        break;
      }

      case 'tool-result': {
        console.log(
          `TOOL RESULT ${chunk.toolName} ${JSON.stringify(chunk.output)}`,
        );
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }
}

main().catch(console.error);
