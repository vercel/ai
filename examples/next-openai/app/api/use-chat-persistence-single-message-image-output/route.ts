import { google } from '@ai-sdk/google';
import { loadChat, saveChat } from '@util/chat-store';
import {
  appendClientMessage,
  appendResponseMessages,
  createDataStreamResponse,
  createIdGenerator,
  streamText,
} from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  // get the last message from the client:
  const { message, id } = await req.json();

  // load the previous messages from the server:
  const previousMessages = await loadChat(id);

  // append the new message to the previous messages:
  const messages = appendClientMessage({
    messages: previousMessages,
    message,
  });

  // immediately start streaming (solves RAG issues with status, etc.)
  return createDataStreamResponse({
    execute: dataStream => {
      const result = streamText({
        model: google('gemini-2.0-flash-exp'),
        providerOptions: {
          google: { responseModalities: ['TEXT', 'IMAGE'] },
        },
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

      result.mergeIntoDataStream(dataStream);
    },
    onError: error => {
      // Error messages are masked by default for security reasons.
      // If you want to expose the error message to the client, you can do so here:
      return error instanceof Error ? error.message : String(error);
    },
  });
}
