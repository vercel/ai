import 'dotenv/config';
import { performance } from 'node:perf_hooks';

async function main() {
  const t0 = performance.now();
  const { openai } = await import('@ai-sdk/openai');
  const t1 = performance.now();
  const { streamText } = await import('ai');
  const t2 = performance.now();

  console.log(`Import @ai-sdk/openai: ${(t1 - t0).toFixed(1)} ms`);
  console.log(`Import ai: ${(t2 - t1).toFixed(1)} ms`);
  console.log(
    `Startup time before streamText: ${performance.now().toFixed(1)} ms`,
  );

  const result = streamText({
    model: openai('gpt-3.5-turbo'),
    maxOutputTokens: 512,
    temperature: 0.3,
    maxRetries: 5,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
