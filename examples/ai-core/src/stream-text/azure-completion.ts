import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: azure.completion('my-gpt-35-turbo-instruct-deployment'), // use your own deployment
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
