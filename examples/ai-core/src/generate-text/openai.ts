import { experimental_generateText } from 'ai';
import { openai, createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';

dotenv.config();

const openai2 = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const result = await experimental_generateText({
    model: openai('gpt-3.5-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main().catch(console.error);
