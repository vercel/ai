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

  // consume full stream in separate promise (thread)
  // to ensure it runs to completion even if the response is aborted
  // (e.g. when the tab is closed)
  //
  // Note: backpressure from the client is not applied when
  // consuming the stream with this approach
  (async () => {
    for await (const part of result.fullStream) {
      // noop
    }
  })();

  return result.toDataStreamResponse();
}
