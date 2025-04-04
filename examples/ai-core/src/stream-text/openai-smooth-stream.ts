import { openai } from '@ai-sdk/openai';
import { smoothStream, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
    experimental_transform: smoothStream({
      chunking: 'word',
    })
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
