import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const result = streamText({
    model: xai.responses('grok-4-1-fast-reasoning'),
    tools: {
      weather: weatherTool,
    },
    prompt: 'What is the weather in San Francisco?',
  });

  for await (const event of result.fullStream) {
    switch (event.type) {
      case 'tool-input-start':
        console.log(`\n[Tool Input Start] ${event.toolName}`);
        break;
      case 'tool-input-delta':
        process.stdout.write(event.delta);
        break;
      case 'tool-input-end':
        console.log('\n[Tool Input End]');
        break;
      case 'tool-call':
        console.log(
          `[Tool Call] ${event.toolName}(${JSON.stringify(event.input)})`,
        );
        break;
      case 'tool-result':
        console.log(`[Tool Result] ${JSON.stringify(event.output)}`);
        break;
      case 'text-delta':
        process.stdout.write(event.text);
        break;
    }
  }

  console.log('\n');
}

main().catch(console.error);
