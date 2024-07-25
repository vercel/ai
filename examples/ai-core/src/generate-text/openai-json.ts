import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const { text, usage } = await generateText({
    model: openai('gpt-3.5-turbo'),
    experimental_responseFormat: { type: 'json' },
    prompt:
      'Invent a new holiday and describe its traditions. Response with JSON.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
