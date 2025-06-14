import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-latest'),
    prompt:
      'What is the current weather in Paris? Please search for real-time weather.',
    providerOptions: {
      anthropic: {
        webSearch: {
          maxUses: 1,
          userLocation: {
            type: 'approximate',
            city: 'Paris',
            country: 'FR',
            timezone: 'Europe/Paris',
          },
        },
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:', result.sources.length);
  console.log('Content blocks:', result.content.length);
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);

  if (result.sources.length > 0) {
    console.log();
    for (const source of result.sources) {
      if (source.sourceType === 'url') {
        console.log('URL:', source.url);
        console.log('Title:', source.title);
        if (source.providerMetadata?.anthropic) {
          console.log('Metadata:', source.providerMetadata.anthropic);
        }
        console.log();
      }
    }
  }
}

main().catch(console.error);
