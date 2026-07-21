import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

async function stream(modelId: string) {
  const result = streamText({
    model: google(modelId),
    prompt: 'Reply with exactly the word hello.',
    maxOutputTokens: 128,
    include: {
      rawChunks: true,
    },
  });

  const rawUsageMetadata: unknown[] = [];
  const errors: unknown[] = [];

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'raw') {
      const rawValue = chunk.rawValue;
      if (
        typeof rawValue === 'object' &&
        rawValue != null &&
        'usageMetadata' in rawValue
      ) {
        rawUsageMetadata.push(rawValue.usageMetadata);
      }
    } else if (chunk.type === 'error') {
      errors.push(chunk.error);
    }
  }

  return {
    modelId,
    text: await result.text,
    usage: await result.usage,
    rawUsageMetadata,
    errors,
  };
}

async function main() {
  const gemmaModelId = process.argv[2] ?? 'gemma-3-12b-it';
  const gemma = await stream(gemmaModelId);
  const gemini = await stream('gemini-2.5-flash');

  console.log(JSON.stringify({ gemma, gemini }, null, 2));

  if (gemma.errors.length > 0 || gemini.errors.length > 0) {
    throw new Error('Provider stream returned an error.');
  }

  if (gemma.text.length > 0 && gemma.usage.outputTokens === 0) {
    throw new Error(
      `Reproduced issue #12013: ${gemmaModelId} streamed non-empty text but AI SDK reported outputTokens: 0.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
