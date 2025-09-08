import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-4o-mini'),
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: 'high',
      }),
    },
    prompt: 'Look up the company that owns Sonny Angel',
    stopWhen: stepCountIs(5), // note: should stop after a single step
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.text);
        break;
      }

      case 'tool-call': {
        console.log('Tool call:', JSON.stringify(chunk, null, 2));
        break;
      }

      case 'tool-result': {
        console.log('Tool result:', JSON.stringify(chunk, null, 2));
        break;
      }

      case 'source': {
        if (chunk.sourceType === 'url') {
          process.stdout.write(`\n\n Source: ${chunk.title} (${chunk.url})`);
        } else {
          process.stdout.write(`\n\n Document: ${chunk.title}`);
        }
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
