import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: google('gemini-1.5-flash-002'),
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
      case 'finish': {
        console.log('Logprobs:', part.providerMetadata?.google.logprobs);
        break;
      }

      case 'error':
        console.error('Error:', part.error);
        break;
    }
  }
}

main().catch(console.error);
