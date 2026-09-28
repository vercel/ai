import { createServer, get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pipeUIMessageStreamToResponse, type UIMessageChunk } from 'ai';

const observationDelayMs = 1_000;

const delay = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  let pipeSettled = false;
  let responseClosed = false;
  let sourceCancelled = false;

  let resolveResponseClosed: (() => void) | undefined;
  const responseClosedPromise = new Promise<void>(resolve => {
    resolveResponseClosed = resolve;
  });

  const server = createServer((_request, response) => {
    response.once('close', () => {
      responseClosed = true;
      resolveResponseClosed?.();
    });

    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'text-start', id: 'text' });
      },
      async pull(controller) {
        await delay(1);
        controller.enqueue({
          type: 'text-delta',
          id: 'text',
          delta: 'x'.repeat(4_096),
        });
      },
      cancel() {
        sourceCancelled = true;
      },
    });

    void pipeUIMessageStreamToResponse({ response, stream }).then(
      () => {
        pipeSettled = true;
      },
      () => {
        pipeSettled = true;
      },
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;
  const request = get({ host: '127.0.0.1', port }, response => {
    response.once('data', () => {
      request.destroy();
    });
  });
  request.on('error', () => {});

  await Promise.race([
    responseClosedPromise,
    delay(2_000).then(() => {
      throw new Error(
        'The server response did not close after the client disconnected.',
      );
    }),
  ]);
  await delay(observationDelayMs);

  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  console.log(
    JSON.stringify(
      {
        responseClosed,
        pipeSettled,
        sourceCancelled,
      },
      null,
      2,
    ),
  );

  if (!pipeSettled || !sourceCancelled) {
    throw new Error(
      'ISSUE_21576_REPRODUCED: pipeUIMessageStreamToResponse did not settle and cancel its source after the client disconnected.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
