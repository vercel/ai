import 'dotenv/config';
async function main() {
  const t0 = performance.now();
  const { groq } = await import('@ai-sdk/groq');
  const t1 = performance.now();
  const { streamText } = await import('ai');
  const t2 = performance.now();

  console.log(`Import @ai-sdk/groq: ${(t1 - t0).toFixed(1)} ms`);
  console.log(`Import ai: ${(t2 - t1).toFixed(1)} ms`);
  console.log(
    `Startup time before streamText: ${performance.now().toFixed(1)} ms`,
  );

  const t3 = performance.now();
  const result = streamText({
    model: groq('gemma2-9b-it'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });
  const t4 = performance.now();

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  const t5 = performance.now();

  console.log(`streamText: ${(t4 - t3).toFixed(1)} ms`);
  console.log(
    `for await (const textPart of result.textStream): ${(t5 - t4).toFixed(1)} ms`,
  );

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
