import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-4o-mini'),
    maxSteps: 5,
    tools: {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: 'high',
      }),
    },
    toolChoice: { type: 'tool', toolName: 'web_search_preview' },
    prompt: 'Look up the company that owns Sonny Angel',
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text': {
        process.stdout.write(chunk.text);
        break;
      }

      case 'source': {
        process.stdout.write(`\n\n Source: ${chunk.title} (${chunk.url})`);
        break;
      }

      case 'finish-step': {
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
        console.log('Total Usage:', chunk.totalUsage);
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }
}

main().catch(console.error);
