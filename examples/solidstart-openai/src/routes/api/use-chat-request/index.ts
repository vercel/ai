import { openai } from '@ai-sdk/openai';
import { streamText, Message } from 'ai';
import { APIEvent } from '@solidjs/start/server';

export const POST = async (event: APIEvent) => {
  // Extract the `messages` from the body of the request
  const { message } = await event.request.json();

  // Implement your own logic here to add message history
  const previousMessages: Message[] = [];
  const messages = [...previousMessages, message];

  // Call the language model
  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    async onFinish({ text, toolCalls, toolResults, usage, finishReason }) {
      // Implement your own logic here, e.g. for storing messages
    },
  });

  // Respond with the stream
  return result.toDataStreamResponse();
};
