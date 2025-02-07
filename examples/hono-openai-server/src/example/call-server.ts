import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

const openai = createOpenAI({
  baseURL: 'http://localhost:8080/v1',
});

async function main() {
  const { text, usage } = await generateText({
    model: openai('openai/gpt-4o'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
