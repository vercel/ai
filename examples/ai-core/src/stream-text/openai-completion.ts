import { streamText } from 'ai/core';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await streamText({
    model: openai.completion({ id: 'gpt-3.5-turbo-instruct' }),
    maxTokens: 1024,
    temperature: 0.3,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main();
