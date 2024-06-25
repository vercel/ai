import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await streamText({
    model: azure('gpt-4o'), // use your own deployment
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
