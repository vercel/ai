import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

const deepSeek = createOpenAI({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

async function main() {
  const { text, usage } = await generateText({
    model: deepSeek('deepseek-coder'),
    prompt: 'Write a "Hello, World!" program in TypeScript.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
