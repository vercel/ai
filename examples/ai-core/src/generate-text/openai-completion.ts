import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai('gpt-4.1-nano'),
    maxOutputTokens: 1024,
    messages: [{ role: 'user', content: 'Output Y or N.' }],
    providerOptions: {
      openai: {
        logprobs: 5,
      },
    },
  });

  console.dir(result.providerMetadata?.openai, { depth: null });
}

main().catch(console.error);
