import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage, request, response } = await generateText({
    model: openai.responses('gpt-4o-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);

  console.log('Request:', request);
  console.log('Response:', response);
}

main().catch(console.error);
