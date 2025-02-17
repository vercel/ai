import { deepseek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: deepseek('deepseek-reasoner'),
    prompt: 'How many "r"s are in the word "strawberry"?',
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning') {
      process.stdout.write('\x1b[34m' + part.textDelta + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.textDelta);
    }
  }
}

main().catch(console.error);
