import { createUIMessageStreamResponse, simulateReadableStream } from 'ai';

export function POST() {
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
          delta: 'Replacement request completed.',
        },
        { type: 'text-end', id: '0' },
        { type: 'finish-step' },
        { type: 'finish' },
      ],
    }),
  });
}
