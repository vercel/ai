import { experimental_streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await experimental_streamText({
    model: openai('gpt-3.5-turbo-instruct'),
    maxTokens: 1024,
    temperature: 0.3,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
