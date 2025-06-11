import { mistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: mistral('magistral-small-2506'),
    prompt: 'What is 2 + 2?',
  });

  console.log('Mistral reasoning model returns raw text with <think> tags:');
  console.log('(Use extract reasoning middleware to parse these if needed)');
  console.log();

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log();
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
