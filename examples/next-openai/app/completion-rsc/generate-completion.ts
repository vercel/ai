'use server';

import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { createStreamableValue } from 'ai/rsc';

export async function generateCompletion(prompt: string) {
  const result = await streamText({
    model: openai('gpt-3.5-turbo-instruct'),
    maxTokens: 2000,
    prompt,
  });

  const streamableCompletion = createStreamableValue('');

  (async () => {
    let completion = '';
    for await (const token of result.textStream) {
      completion += token;
      streamableCompletion.update(completion);
    }
  })();

  return streamableCompletion.value;
}
