import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function state() {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Hello, how are you?',
  });

  return result.toDataStream(); // TODO special stream format toAgentStream
}
