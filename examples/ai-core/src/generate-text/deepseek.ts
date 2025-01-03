import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import 'dotenv/config';

const deepSeek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com',
  headers: {
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY ?? ''}`,
  },
});

async function main() {
  const { text, usage } = await generateText({
    model: deepSeek('deepseek-chat'),
    prompt: 'Write a "Hello, World!" program in TypeScript.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
