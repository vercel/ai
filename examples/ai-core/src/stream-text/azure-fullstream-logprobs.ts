import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: azure('gpt-4.1-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      azure: {
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
        console.log('metadata:', JSON.stringify(part.providerMetadata)); // object: { string, number, array}
        console.log('Logprobs:', part.providerMetadata?.azure.logprobs); // object: { string, number, array}
      }
    }
  }
});
