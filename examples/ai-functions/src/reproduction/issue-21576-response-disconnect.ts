import http from 'node:http';
import {
  pipeUIMessageStreamToResponse,
  type UIMessageChunk,
} from '../../../../packages/ai/src';

const wait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

async function main() {
  let pipeSettled = false;
  let responseClosed = false;
  let sourceCancelled = false;
  let markResponseClosed: () => void;

  const responseClosedPromise = new Promise<void>(resolve => {
    markResponseClosed = resolve;
  });

  const server = http.createServer((_request, response) => {
    response.once('close', () => {
      responseClosed = true;
      markResponseClosed();
    });

    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: 'start' });
        controller.enqueue({ type: 'text-start', id: 'text' });
      },
      async pull(controller) {
        await wait(1);
        controller.enqueue({
          type: 'text-delta',
          id: 'text',
          delta: 'x'.repeat(64 * 1024),
        });
      },
      cancel() {
        sourceCancelled = true;
      },
    });

    pipeUIMessageStreamToResponse({ response, stream })
      .then(() => {
        pipeSettled = true;
      })
      .catch(() => {
        pipeSettled = true;
      });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Failed to determine the reproduction server port.');
  }

  const request = http.get(
    { host: '127.0.0.1', port: address.port },
    response => {
      response.once('data', () => {
        request.destroy();
      });
    },
  );
  request.on('error', () => {});

  await Promise.race([
    responseClosedPromise,
    wait(2_000).then(() => {
      throw new Error(
        'Reproduction setup failed: the server response did not close.',
      );
    }),
  ]);
  await wait(1_000);
  request.destroy();
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  if (!responseClosed || !pipeSettled || !sourceCancelled) {
    console.error(
      `ISSUE_21576_REPRODUCED: response closed=${responseClosed}, pipe settled=${pipeSettled}, source cancelled=${sourceCancelled}; expected all true after the client disconnected`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue not reproduced: the pipe settled and the source was cancelled after the response closed.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
