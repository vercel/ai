import { AssistantMessage, AssistantStatus } from '../shared/types';

export function expertimental_AssistantResponse(
  process: (stream: {
    sendThreadId: (threadId: string) => void;
    sendMessage: (message: AssistantMessage) => void;
  }) => Promise<void>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const textEncoder = new TextEncoder();

      const sendMessage = (message: AssistantMessage) => {
        controller.enqueue(
          textEncoder.encode(`0: ${JSON.stringify(message)}\n\n`),
        );
      };

      const sendStatus = (status: AssistantStatus) => {
        controller.enqueue(
          textEncoder.encode(`3: ${JSON.stringify(status)}\n\n`),
        );
      };

      const sendThreadId = (threadId: string) => {
        controller.enqueue(
          textEncoder.encode(`4: ${JSON.stringify(threadId)}\n\n`),
        );
      };

      sendStatus({ status: 'in_progress' });

      try {
        await process({ sendMessage, sendThreadId });
      } catch (error) {
        sendStatus({
          status: 'failed',
          message: (error as any).message ?? `${error}`,
        });
      } finally {
        sendStatus({ status: 'complete' });
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
