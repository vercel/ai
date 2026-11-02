import { start } from 'workflow/api';
import { WorkflowRunFailedError } from 'workflow/errors';
import {
  createMaintainerVideos,
  type AsyncApisProgressUpdate,
} from '@/workflow/async-apis';

export const maxDuration = 800;

function getErrorMessage(error: unknown): string {
  if (WorkflowRunFailedError.is(error)) {
    return getErrorMessage(error.cause);
  }

  return error instanceof Error ? error.message : String(error);
}

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
  const progressReader = run.getReadable<AsyncApisProgressUpdate>().getReader();
  let closed = false;
  let progressEnded = false;
  let runOutcome:
    | { status: 'completed' }
    | { status: 'failed'; error: unknown };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;

        closed = true;
        controller.close();
        void progressReader.cancel().catch(() => undefined);
      };

      const write = (update: AsyncApisProgressUpdate) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(update)}\n`));
      };

      const fail = (error: unknown) => {
        write({ type: 'error', message: getErrorMessage(error) });
        close();
      };

      const finishIfSettled = () => {
        if (closed || runOutcome == null) return;

        if (runOutcome.status === 'failed') {
          fail(runOutcome.error);
        } else if (progressEnded) {
          fail(
            new Error(
              'The workflow completed without sending a terminal progress update.',
            ),
          );
        }
      };

      void (async () => {
        try {
          while (true) {
            const { done, value } = await progressReader.read();
            if (closed) return;

            if (done) {
              progressEnded = true;
              finishIfSettled();
              return;
            }

            write(value);
            if (value.type === 'complete' || value.type === 'error') {
              close();
              return;
            }
          }
        } catch (error) {
          fail(error);
        }
      })();

      void (async () => {
        while (true) {
          if (closed) return;

          try {
            const status = await run.status;
            if (closed) return;

            if (status === 'completed') {
              runOutcome = { status: 'completed' };
              finishIfSettled();
              return;
            }

            if (status === 'failed' || status === 'cancelled') {
              await run.returnValue;
            }
          } catch (error) {
            runOutcome = { status: 'failed', error };
            finishIfSettled();
            return;
          }

          await new Promise(resolve => setTimeout(resolve, 500));
        }
      })();
    },
    cancel(reason) {
      closed = true;
      return progressReader.cancel(reason).catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Workflow-Run-Id': run.runId,
    },
  });
}
