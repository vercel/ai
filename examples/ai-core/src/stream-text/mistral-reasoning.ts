import { mistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: mistral('magistral-small-2507'),
    prompt: 'What is 2 + 2?',
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'reasoning-start': {
        console.log('\n--- Reasoning ---');
        break;
      }
      case 'reasoning-delta': {
        process.stdout.write(part.text);
        break;
      }
      case 'reasoning-end': {
        console.log('\n--- End Reasoning ---\n');
        break;
      }
      case 'text-delta': {
        process.stdout.write(part.text);
        break;
      }
      case 'finish': {
        console.log('\n\nFinish reason:', part.finishReason);
        console.log('Token usage:', part.totalUsage);
        break;
      }
    }
  }
}

main().catch(console.error);
