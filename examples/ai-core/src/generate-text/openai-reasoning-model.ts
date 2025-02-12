import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage, providerMetadata } = await generateText({
    model: openai('o1-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxTokens: 1000, // mapped to max_completion_tokens
  });

  console.log(text);
  console.log();
  console.log('Usage:', {
    ...usage,
    reasoningTokens: providerMetadata?.openai?.reasoningTokens,
  });
}

main().catch(console.error);
