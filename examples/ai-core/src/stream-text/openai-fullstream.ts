import { experimental_streamText } from 'ai';
import { OpenAI } from 'ai/openai';
import dotenv from 'dotenv';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

dotenv.config();

const openai = new OpenAI();

async function main() {
  const result = await experimental_streamText({
    model: openai.chat('gpt-3.5-turbo'),
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
        console.log('Usage:', part.usage);
        break;
      }

      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }
}

main().catch(console.error);
