import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('o1'),
    system: 'You are a helpful assistant.',
    prompt: 'Invent a new holiday and describe its traditions.',
    temperature: 0.5, // should get ignored (warning)
    maxTokens: 1000, // mapped to max_completion_tokens
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
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
