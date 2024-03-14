import { streamText } from 'ai/core';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await streamText({
    model: openai.chat({ id: 'gpt-3.5-turbo' }),
    maxTokens: 512,
    temperature: 5.7,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main();
