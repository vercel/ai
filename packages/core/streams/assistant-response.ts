import { AssistantMessage, AssistantStatus, JSONValue } from '../shared/types';

export function expertimental_AssistantResponse(
  process: (stream: {
    sendStatus: (status: AssistantStatus) => void;
    sendThreadId: (threadId: string) => void;
    sendMessage: (message: AssistantMessage) => void;
    sendData: (data: JSONValue) => void;
  }) => Promise<void>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const textEncoder = new TextEncoder();

      await process({
        sendMessage: (message: AssistantMessage) => {
          // TODO have a smarter streaming protocol that only sends delta + msg id
          controller.enqueue(
            textEncoder.encode(`0: ${JSON.stringify(message)}\n\n`),
          );
        },

        sendData: (data: JSONValue) => {
          controller.enqueue(
            textEncoder.encode(`2: ${JSON.stringify(data)}\n\n`),
          );
        },

        sendStatus: (status: AssistantStatus) => {
          controller.enqueue(
            textEncoder.encode(`3: ${JSON.stringify(status)}\n\n`),
          );
        },

        sendThreadId: (threadId: string) => {
          controller.enqueue(
            textEncoder.encode(`4: ${JSON.stringify(threadId)}\n\n`),
          );
        },
      });

      controller.close();
    },
    pull(controller) {},
    cancel() {
      // This is called if the reader cancels,
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
