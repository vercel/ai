import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { createGuardedFetch } from 'guarded-fetch';
import { run } from '../../lib/run';

run(async () => {
  const fetch = createGuardedFetch();
  try {
    const openai = createOpenAI({ fetch });
    const result = streamText({
      model: openai('gpt-4.1-mini'),
      prompt: 'Reply with the word hello.',
      maxOutputTokens: 20,
      maxRetries: 0,
    });
    for await (const text of result.textStream) process.stdout.write(text);
    console.log();
  } finally {
    await fetch.close();
  }
});
