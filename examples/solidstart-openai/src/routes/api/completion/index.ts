import { openai } from '@ai-sdk/openai';
import { APIEvent } from '@solidjs/start/server';
import { streamText } from 'ai';

export const POST = async (event: APIEvent) => {
  // Extract the `prompt` from the body of the request
  const { prompt } = await event.request.json();

  // Ask OpenAI for a streaming chat completion given the prompt
  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  // Respond with the stream
  return result.toDataStreamResponse();
};
