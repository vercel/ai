import { mistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: mistral('magistral-small-2506'),
    prompt: 'How many "r"s are in the word "strawberry"?',
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning') {
      // Display reasoning in blue
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text') {
      // Display final answer in normal color
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Usage:', await result.usage);
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
