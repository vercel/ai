import { runBenchmark } from '@/lib/benchmark';
import type { BenchmarkProgressEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    caseId?: string;
    model?: string;
  };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: BenchmarkProgressEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        await runBenchmark({
          caseId: body.caseId ?? 'case_1842',
          model: body.model,
          onProgress: send,
        });
      } catch (error) {
        send({
          type: 'benchmark-error',
          error:
            error instanceof Error ? error.message : 'Unknown benchmark error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
