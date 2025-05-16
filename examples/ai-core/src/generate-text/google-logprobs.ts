import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: google('gemini-1.5-flash-002'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      google: {
        logprobs: 2,
      },
    },
  });

  console.log(result.providerMetadata?.google.logprobs);
}

main().catch(console.error);
