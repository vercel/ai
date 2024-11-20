import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

const togetherai = createOpenAI({
  name: 'togetherai',
  apiKey: process.env.TOGETHER_AI_API_KEY!,
  baseURL: 'https://api.together.xyz/v1/',
});

async function main() {
  const { text, usage } = await generateText({
    model: togetherai('google/gemma-2-9b-it'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
