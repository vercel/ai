import { createTogetherAI } from '@ai-sdk/togetherai';
import { generateText } from 'ai';
import 'dotenv/config';

const togetherai = createTogetherAI({
  apiKey: process.env.TOGETHER_AI_API_KEY!,
  baseURL: 'https://api.together.xyz/v1/',
});

async function main() {
  const { text, usage } = await generateText({
    // model: togetherai('google/gemma-2-9b-it'),
    model: togetherai('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
