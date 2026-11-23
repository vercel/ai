import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { createGuardedFetch } from 'guarded-fetch';
import { run } from '../../lib/run';

run(async () => {
  const fetch = createGuardedFetch();
  try {
    const openai = createOpenAI({ fetch });
    const result = await generateText({
      model: openai('gpt-4.1-mini'),
      prompt: 'Reply with the word hello.',
      maxOutputTokens: 20,
      maxRetries: 0,
    });
    console.log(result.text);
  } finally {
    await fetch.close();
  }
});
