import { streamText } from 'ai/core';
import { mistral } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await streamText({
    model: mistral.chat({ id: 'mistral-small-latest' }),
    prompt: 'What is the best French cheese?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main();
