import { openai } from '@ai-sdk/openai';
import { APIEvent } from '@solidjs/start/server';
import { convertToCoreMessages, streamText } from 'ai';

export const POST = async (event: APIEvent) => {
  // 'data' contains the additional data that you have sent:
  const { messages, data } = await event.request.json();

  const initialMessages = messages.slice(0, -1);
  const currentMessage = messages[messages.length - 1];

  const result = await streamText({
    model: openai('gpt-4o'),
    messages: [
      ...convertToCoreMessages(initialMessages),
      {
        ...currentMessage,
        content: [
          { type: 'text', text: currentMessage.content },
          {
            type: 'image',
            image: new URL(data.imageUrl),
          },
        ],
      },
    ],
  });

  // Respond with the stream
  return result.toDataStreamResponse();
};
