import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      openai: {
        logprobs: 2,
      },
    },
  });

  console.log(result.providerMetadata?.openai.logprobs);
}

main().catch(console.error);
