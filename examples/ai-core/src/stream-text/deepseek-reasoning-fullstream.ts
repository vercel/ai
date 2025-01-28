import { deepseek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: deepseek('deepseek-reasoner'),
    prompt: 'How many "r"s are in the word "strawberry"?',
  });

  let enteredReasoning = false;
  let enteredText = false;
  for await (const part of result.fullStream) {
    if (part.type === 'reasoning') {
      if (!enteredReasoning) {
        enteredReasoning = true;
        console.log('\nREASONING:\n');
      }
      process.stdout.write(part.textDelta);
    } else if (part.type === 'text-delta') {
      if (!enteredText) {
        enteredText = true;
        console.log('\nTEXT:\n');
      }
      process.stdout.write(part.textDelta);
    }
  }
}

main().catch(console.error);
