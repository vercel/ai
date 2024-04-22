import { experimental_generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await experimental_generateText({
    model: openai('gpt-3.5-turbo', { logprobs: 2 }),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result);
}

main().catch(console.error);
