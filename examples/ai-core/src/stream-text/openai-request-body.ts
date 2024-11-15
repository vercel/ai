import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  // consume stream
  for await (const textPart of result.textStream) {
  }

  console.log('REQUEST BODY');
  console.log((await result.request).body);
}

main().catch(console.error);
