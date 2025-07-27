import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: azure('gpt-4o'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      openai: {
        logprobs: 2,
      },
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta': {
        console.log('Text:', part.text);
        break;
      }

      case 'finish-step': {
        console.log(`finishReason: ${part.finishReason}`);
        console.log('Logprobs:', part.providerMetadata?.azure.logprobs); // object: { string, number, array}
      }
    }
  }
}

main().catch(console.error);
