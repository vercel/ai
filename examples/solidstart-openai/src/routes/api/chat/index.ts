import { openai } from '@ai-sdk/openai';
import { convertToCoreMessages, streamText } from 'ai';
import { APIEvent } from '@solidjs/start/server';

export const POST = async (event: APIEvent) => {
  const { messages } = await event.request.json();

  const result = await streamText({
    model: openai('gpt-3.5-turbo'),
    messages: convertToCoreMessages(messages),
  });

  return result.toAIStreamResponse();
};
