import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-3.5-turbo'),
    onChunk({ chunk }) {
      console.log('onChunk', chunk);
    },
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  // consume stream:
  for await (const textPart of result.textStream) {
  }
}

main().catch(console.error);
