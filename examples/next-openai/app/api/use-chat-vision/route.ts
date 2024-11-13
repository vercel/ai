import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  // 'data' contains the additional data that you have sent:
  const { messages, data } = await req.json();

  const initialMessages = messages.slice(0, -1);
  const currentMessage = messages[messages.length - 1];

  // Call the language model
  const result = streamText({
    model: openai('gpt-4-turbo'),
    messages: [
      ...initialMessages,
      {
        role: 'user',
        content: [
          { type: 'text', text: currentMessage.content },
          { type: 'image', image: new URL(data.imageUrl) },
        ],
      },
    ],
  });

  // Respond with the stream
  return result.toDataStreamResponse();
}
