import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = streamText({
    model: openai('gpt-3.5-turbo'),
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
      case 'text': {
        console.log('Text:', part.text);
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
        switch (part.toolName) {
          // NOT AVAILABLE (NO EXECUTE METHOD)
          // case 'cityAttractions': {
          //   console.log('TOOL RESULT cityAttractions');
          //   console.log(`city: ${part.args.city}`); // string
          //   console.log(`result: ${part.result}`);
          //   break;
          // }

          case 'weather': {
            console.log('TOOL RESULT weather');
            console.log(`location: ${part.args.location}`); // string
            console.log(`temperature: ${part.result.temperature}`); // number
            break;
          }
        }

        break;
      }

      case 'finish': {
        console.log('Finish reason:', part.finishReason);
        console.log('Total Usage:', part.totalUsage);
        break;
      }

      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }
}

main().catch(console.error);
