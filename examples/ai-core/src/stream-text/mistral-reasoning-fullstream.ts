import { mistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: mistral('magistral-medium-2506'),
    prompt:
      'Solve this math problem step by step: If a train travels 120 miles in 2 hours, then speeds up and travels 180 miles in the next 1.5 hours, what is the average speed for the entire journey?',
  });

  let enteredReasoning = false;
  let enteredText = false;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'reasoning': {
        if (!enteredReasoning) {
          enteredReasoning = true;
          console.log('\nREASONING:\n');
        }
        process.stdout.write(part.text);
        break;
      }

      case 'reasoning-part-finish': {
        console.log('\n\nTEXT:\n');
        break;
      }

      case 'text': {
        if (!enteredText) {
          enteredText = true;
        }
        process.stdout.write(part.text);
        break;
      }
    }
  }

  console.log('\n');
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
