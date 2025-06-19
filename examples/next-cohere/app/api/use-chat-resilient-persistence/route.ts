import { openai } from '@ai-sdk/openai';
import { saveChat } from '@util/chat-store';
import { appendResponseMessages, createIdGenerator, streamText } from 'ai';

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
  // no await
  result.consumeStream({
    onError: error => {
      console.log('Error during background stream consumption: ', error); // optional error callback
    },
  });

  return result.toDataStreamResponse();
}
