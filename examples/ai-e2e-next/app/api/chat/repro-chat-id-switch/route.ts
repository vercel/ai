/**
 * Reproduction API for Bug #5: Chat ID change does not abort previous stream
 *
 * Slow streaming (~6s) so user has time to switch chat ID during stream.
 * When fixed: client abort → req.signal.aborted → we exit early.
 * When buggy: stream runs to completion even after chat switch.
 */
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

export const maxDuration = 30;

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const chatId = body?.id ?? 'unknown';

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: 'text-1' });

      for (let i = 0; i < 12; i++) {
        if (req.signal.aborted) {
          console.log(`[log] chatId=${chatId} ABORTED (client disconnected)`);
          return;
        }
        await delay(500);
        writer.write({
          type: 'text-delta',
          id: 'text-1',
          delta: i === 0 ? `chat-${chatId} streaming... ` : '.',
        });
      }

      writer.write({ type: 'text-end', id: 'text-1' });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish', finishReason: 'stop' });
      console.log(`[log] chatId=${chatId} COMPLETED (no abort)`);
    },
  });

  return createUIMessageStreamResponse({ status: 200, stream });
}
