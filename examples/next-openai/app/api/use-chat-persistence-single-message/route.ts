import { openai } from '@ai-sdk/openai';
import { appendResponseMessages, createIdGenerator, streamText } from 'ai';
import { loadChat, saveChat } from '@util/chat-store';

export async function POST(req: Request) {
  // get the last message from the client:
  const { message, id } = await req.json();

  // load the previous messages from the server:
  const previousMessages = await loadChat(id);

  // append the new message to the previous messages:
  const messages = [...previousMessages, message];

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages,
    // id format for server-side messages:
    experimental_generateMessageId: createIdGenerator({
      prefix: 'msgs',
      size: 16,
    }),
    async onFinish({ response }) {
      await saveChat({
        id,
        messages: appendResponseMessages({
          messages,
          responseMessages: response.messages,
        }),
      });
    },
  });

  return result.toDataStreamResponse();
}
