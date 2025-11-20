import { groq } from '@ai-sdk/groq';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: groq('deepseek-r1-distill-llama-70b'),
    providerOptions: {
      groq: { reasoningFormat: 'parsed' },
    },
    prompt: 'How many "r"s are in the word "strawberry"?',
  });

  let enteredReasoning = false;
  let enteredText = false;
  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      if (!enteredReasoning) {
        enteredReasoning = true;
        console.log('\nREASONING:\n');
      }
      process.stdout.write(part.text);
    } else if (part.type === 'text-delta') {
      if (!enteredText) {
        enteredText = true;
        console.log('\nTEXT:\n');
      }
      process.stdout.write(part.text);
    }
  }
}

main().catch(console.error);
