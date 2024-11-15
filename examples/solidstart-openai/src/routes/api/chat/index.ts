import { openai } from '@ai-sdk/openai';
import { APIEvent } from '@solidjs/start/server';
import { streamText } from 'ai';

export const POST = async (event: APIEvent) => {
  // Extract the `messages` from the body of the request
  const { messages } = await event.request.json();

  // Call the language model
  const result = streamText({
    model: openai('gpt-4-turbo'),
    messages,
    async onFinish({ text, toolCalls, toolResults, usage, finishReason }) {
      // implement your own logic here, e.g. for storing messages
      // or recording token usage
    },
  });

  // Respond with the stream
  return result.toDataStreamResponse();
};
