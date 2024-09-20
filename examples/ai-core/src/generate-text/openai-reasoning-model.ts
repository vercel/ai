import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage, experimental_providerMetadata } = await generateText({
    model: openai('o1-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
    experimental_providerMetadata: {
      openai: { maxCompletionTokens: 1000 },
    },
  });

  console.log(text);
  console.log();
  console.log('Usage:', {
    ...usage,
    reasoningTokens: experimental_providerMetadata?.openai?.reasoningTokens,
  });
}

main().catch(console.error);
