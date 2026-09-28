import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai';

const KEEP_ALIVE_MS = 100;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get('mode');

  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      if (mode === 'seeded' || mode === 'warmup') {
        controller.enqueue({
          type: 'text-delta',
          id: 'reproduction-17805',
          delta: 'open',
        });
      }

      if (mode === 'warmup') {
        controller.close();
      }
    },
  });

  const keepAliveOptions: Record<string, number> = {
    keepAliveMs: KEEP_ALIVE_MS,
  };

  return createUIMessageStreamResponse({
    stream,
    ...keepAliveOptions,
  });
}
