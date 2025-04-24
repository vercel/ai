import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: google('gemini-2.0-flash-exp'),
    providerOptions: {
      google: {
        useSearchGrounding: true,
      },
    },
    prompt: 'List the top 5 San Francisco news from the past week.',
  });

  console.log(result.text);
  console.log();
  console.log('SOURCES');
  console.log(result.sources);
  console.log();
  console.log('PROVIDER METADATA');
  console.log(result.providerMetadata?.google);
}

main().catch(console.error);
