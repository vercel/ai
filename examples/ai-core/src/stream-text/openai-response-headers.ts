import { openai } from '@ai-sdk/openai';
import { experimental_streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await experimental_streamText({
    model: openai('gpt-3.5-turbo'),
    maxTokens: 512,
    temperature: 0.3,
    maxRetries: 5,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(`Request ID: ${result.rawResponse?.headers?.['x-request-id']}`);
  console.log();

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
