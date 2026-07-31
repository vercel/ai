import { start } from 'workflow/api';
import {
  createMaintainerVideos,
  type AsyncApisProgressUpdate,
} from '@/workflow/async-apis';

export const maxDuration = 800;

export async function POST(request: Request) {
  const body = (await request.json()) as { repositoryUrl?: unknown };
  if (
    typeof body.repositoryUrl !== 'string' ||
    body.repositoryUrl.length === 0
  ) {
    return Response.json(
      { error: 'repositoryUrl must be a GitHub repository URL.' },
      { status: 400 },
    );
  }

  const run = await start(createMaintainerVideos, [body.repositoryUrl]);
  const encoder = new TextEncoder();
  const stream = run.getReadable<AsyncApisProgressUpdate>().pipeThrough(
    new TransformStream<AsyncApisProgressUpdate, Uint8Array>({
      transform(update, controller) {
        controller.enqueue(encoder.encode(`${JSON.stringify(update)}\n`));
      },
    }),
  );

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Workflow-Run-Id': run.runId,
    },
  });
}
