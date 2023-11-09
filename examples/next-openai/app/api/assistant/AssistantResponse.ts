export type AssistantStatus = {
  status: 'in_progress' | 'complete' | 'failed';
  information?: string;
};

export function AssistantResponse(
  process: (stream: {
    sendStatus: (status: AssistantStatus) => void;
    sendThreadId: (threadId: string) => void;
  }) => Promise<void>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const textEncoder = new TextEncoder();

      await process({
        // TODO write custom data
        // TODO write message

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
