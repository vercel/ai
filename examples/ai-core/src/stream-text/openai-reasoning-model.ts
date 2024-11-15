import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('o1-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
    experimental_providerMetadata: {
      openai: { maxCompletionTokens: 1000 },
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Usage:', {
    ...(await result.usage),
    reasoningTokens: (await result.experimental_providerMetadata)?.openai
      ?.reasoningTokens,
  });
}

main().catch(console.error);
