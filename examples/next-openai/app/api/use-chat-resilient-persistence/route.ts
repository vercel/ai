import { openai } from '@ai-sdk/openai';
import { appendResponseMessages, createIdGenerator, streamText } from 'ai';
import { saveChat } from '@util/chat-store';

export async function POST(req: Request) {
  const { messages, id } = await req.json();

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

  // consume the stream to ensure it runs to completion and triggers onFinish
  // even when the client response is aborted (e.g. when the browser tab is closed).
  result.consumeStream(); // no await

  return result.toDataStreamResponse();
}
