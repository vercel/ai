import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'What happened in tech news today?',
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: 'medium',
      }),
    },
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
});
