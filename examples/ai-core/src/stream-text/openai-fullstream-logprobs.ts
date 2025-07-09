import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-3.5-turbo'),
    maxOutputTokens: 512,
    temperature: 0.3,
    maxRetries: 5,
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      openai: {
        logprobs: 2,
      },
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'finish-step': {
        console.log('Logprobs:', part.providerMetadata?.openai.logprobs);
        break;
      }

      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }
}

main().catch(console.error);
