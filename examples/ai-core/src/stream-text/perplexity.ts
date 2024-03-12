import { streamText } from 'ai/core';
import { perplexity } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await streamText({
    model: perplexity.chat({ id: 'pplx-70b-online' }),
    prompt: 'What happened in San Francisco in this week?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main();
