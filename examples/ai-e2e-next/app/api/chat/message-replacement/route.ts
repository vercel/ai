import { createUIMessageStreamResponse, simulateReadableStream } from 'ai';

export async function POST(req: Request) {
  const { messageId, messages } = (await req.json()) as {
    messageId: string | undefined;
    messages: Array<{ id: string }>;
  };
  const replacementId = messages.at(-1)?.id ?? 'missing';

  return createUIMessageStreamResponse({
    stream: simulateReadableStream({
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
      chunks: [
        { type: 'start' },
        { type: 'start-step' },
        { type: 'text-start', id: '0' },
        {
          type: 'text-delta',
          id: '0',
          delta: `Replaced ${messageId} with ${replacementId}`,
        },
        { type: 'text-end', id: '0' },
        { type: 'finish-step' },
        { type: 'finish' },
      ],
    }),
  });
}
