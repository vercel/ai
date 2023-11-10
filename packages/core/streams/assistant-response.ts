import { AssistantMessage, AssistantStatus } from '../shared/types';

export function expertimental_AssistantResponse(
  process: (stream: {
    sendStatus: (status: AssistantStatus) => void;
    sendThreadId: (threadId: string) => void;
    sendMessage: (message: AssistantMessage) => void;
  }) => Promise<void>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const textEncoder = new TextEncoder();

      try {
        await process({
          sendMessage: (message: AssistantMessage) => {
            controller.enqueue(
              textEncoder.encode(`0: ${JSON.stringify(message)}\n\n`),
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
      } finally {
        controller.close();
      }
    },
    pull(controller) {},
    cancel() {},
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
