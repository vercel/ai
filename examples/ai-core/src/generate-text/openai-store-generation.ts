import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Who worked on the original macintosh?',
    experimental_providerMetadata: {
      openai: {
        store: true,
      },
    },
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
