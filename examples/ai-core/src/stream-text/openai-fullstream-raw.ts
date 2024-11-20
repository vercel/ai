import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const part of result.fullStream) {
    console.log(JSON.stringify(part));
  }
}

main().catch(console.error);
