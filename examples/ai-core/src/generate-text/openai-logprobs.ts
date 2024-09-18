import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo', { logprobs: 2 }),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.logprobs);
}

main().catch(console.error);
