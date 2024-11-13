import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: azure('gpt-4o', { logprobs: true }),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        console.log('Text delta:', part.textDelta);
        break;
      }

      case 'finish': {
        console.log(`finishReason: ${part.finishReason}`);
        console.log('Logprobs:', part.logprobs); // object: { string, number, array}
      }
    }
  }
}

main().catch(console.error);
