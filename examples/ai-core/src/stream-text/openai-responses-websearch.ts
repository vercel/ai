import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'What happened in San Francisco last week?',
    tools: {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: 'high',
        userLocation: {
          type: 'approximate',
          city: 'San Francisco',
          region: 'California',
        },
      }),
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Sources:', await result.sources);
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
