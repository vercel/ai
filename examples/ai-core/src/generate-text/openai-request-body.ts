import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { request } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log('REQUEST BODY');
  console.log(request.body);
}

main().catch(console.error);
