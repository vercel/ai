import { get, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pipeUIMessageStreamToResponse } from 'ai';

const failureSignal =
  'ISSUE #21576 REPRODUCED: a closed response left the pipe pending or its source uncancelled';

const delay = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

async function main() {
  let sourceCancelled = false;
  let pipeSettled = false;
  let responseClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'start' as const });
      controller.enqueue({ type: 'text-start' as const, id: 'text' });
    },
    async pull(controller) {
      await delay(1);
      controller.enqueue({
        type: 'text-delta' as const,
        id: 'text',
        delta: 'x'.repeat(4096),
      });
    },
    cancel() {
      sourceCancelled = true;
    },
  });

  const server = createServer((_request, response) => {
    response.once('close', () => {
      responseClosed = true;
    });

    void pipeUIMessageStreamToResponse({ response, stream })
      .catch(() => {})
      .finally(() => {
        pipeSettled = true;
      });
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

  await delay(1000);

  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  if (!responseClosed) {
    throw new Error('Reproduction setup failed: response did not close');
  }

  if (!pipeSettled || !sourceCancelled) {
    throw new Error(
      `${failureSignal}; pipeSettled=${pipeSettled}, sourceCancelled=${sourceCancelled}`,
    );
  }

  console.log(
    'PASS: the pipe settled and cancelled its source after the response closed',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
