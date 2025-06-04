import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-latest'),
    prompt: 'What are the latest developments in AI research and technology?',
    providerOptions: {
      anthropic: {
        webSearch: {
          maxUses: 5,
          userLocation: {
            type: 'approximate',
            city: 'San Francisco',
            region: 'California',
            country: 'US',
            timezone: 'America/Los_Angeles',
          },
        },
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:', result.sources);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);

  for (const source of result.sources) {
    if (source.sourceType === 'url') {
      console.log('Source ID:', source.id);
      console.log('URL:', source.url);
      console.log('Title:', source.title);
      console.log();
    }
  }
}

main().catch(console.error);
