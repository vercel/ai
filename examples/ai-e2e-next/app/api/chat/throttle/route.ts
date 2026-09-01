import { createUIMessageStreamResponse, simulateReadableStream } from 'ai';

export async function POST(req: Request) {
  return createUIMessageStreamResponse({
    stream: simulateReadableStream({
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
      chunks: [
        {
          type: 'start',
        },
        {
          type: 'start-step',
        },
        {
          type: 'text-start',
          id: 'text-1',
        },
        ...Array(500).fill({ type: 'text-delta', id: 'text-1', delta: 'T\n' }),
        {
          type: 'text-end',
          id: 'text-1',
        },
        {
          type: 'finish-step',
        },
        {
          type: 'finish',
        },
      ],
    }),
  });
}
