import { openai } from '@ai-sdk/openai';
import dotenv from 'dotenv';
import { weatherTool } from '../tools/weather-tool';
import { streamText } from 'ai';

dotenv.config();

async function main() {
  const result = await streamText({
    model: openai('gpt-3.5-turbo'),
    maxToolRoundtrips: 5,
    tools: {
      weather: weatherTool,
    },
    prompt: 'What is the weather in San Francisco?',
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.textDelta);
        break;
      }

      case 'tool-call': {
        switch (chunk.toolName) {
          case 'weather': {
            console.log('TOOL CALL weather');
            console.log(`location: ${chunk.args.location}`); // string
            console.log();
            break;
          }
        }

        break;
      }

      case 'tool-result': {
        switch (chunk.toolName) {
          case 'weather': {
            console.log('TOOL RESULT weather');
            console.log(`location: ${chunk.args.location}`); // string
            console.log(`temperature: ${chunk.result.temperature}`); // number
            console.log();
            break;
          }
        }

        break;
      }

      case 'finish': {
        console.log();
        console.log();
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
