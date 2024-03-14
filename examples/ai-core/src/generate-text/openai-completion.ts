import { generateText } from 'ai/core';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await generateText({
    model: openai.completion({ id: 'gpt-3.5-turbo-instruct' }),
    maxTokens: 1024,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main();
