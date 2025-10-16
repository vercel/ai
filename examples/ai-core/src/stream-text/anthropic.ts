import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log();
  console.log('Request body:');
  console.dir((await result.request).body, { depth: Infinity });
  console.log();
  console.log('Warnings:');
  console.dir(await result.warnings, { depth: Infinity });
});
