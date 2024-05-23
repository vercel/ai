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

  const streamable = createStreamableValue('');

  (async () => {
    try {
      let text = '';
      for await (const token of result.textStream) {
        text += token;
        streamable.update(text);
      }
      streamable.done();
    } catch (error) {
      streamable.error(error);
    }
  })();

  return streamable.value;
}
