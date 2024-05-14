import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  headers: {
    'X-My-Header': 'something',
  },
});

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main().catch(console.error);
