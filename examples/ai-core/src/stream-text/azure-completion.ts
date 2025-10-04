import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';

/**
 * *** NOTICE ***
 * The completion API may not be available.
 */

async function main() {
  const result = streamText({
    model: azure.completion('gpt-35-turbo'), // use your own deployment
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
