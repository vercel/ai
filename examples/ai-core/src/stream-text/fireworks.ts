import { streamText } from 'ai/core';
import { fireworks } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await streamText({
    model: fireworks.chat({
      id: 'accounts/fireworks/models/firefunction-v1',
      promptTruncateLength: 2000, // fireworks-specific option
    }),

    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main();
