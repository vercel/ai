import { createServer } from 'node:http';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';

const timeoutMs = 500;
const reproductionSignal =
  'Reproduced issue #21720: createMCPClient remained pending after the SSE stream closed before an endpoint event.';

type ClientOutcome =
  | { type: 'resolved'; client: MCPClient }
  | { type: 'rejected'; error: unknown }
  | { type: 'pending' };

async function main() {
  let requestCount = 0;
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/sse') {
      response.writeHead(404).end();
      return;
    }

    requestCount++;
    response.writeHead(200, {
      'content-type': 'text/event-stream',
    });
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Expected the reproduction server to use a TCP port.');
    }

    const clientPromise = createMCPClient({
      transport: {
        type: 'sse',
        url: `http://127.0.0.1:${address.port}/sse`,
      },
    });

    const outcome = await Promise.race<ClientOutcome>([
      clientPromise.then(
        client => ({ type: 'resolved', client }),
        error => ({ type: 'rejected', error }),
      ),
      new Promise<{ type: 'pending' }>(resolve => {
        setTimeout(() => resolve({ type: 'pending' }), timeoutMs);
      }),
    ]);

    if (requestCount !== 1) {
      throw new Error(
        `Expected one SSE connection request, received ${requestCount}.`,
      );
    }

    if (outcome.type === 'pending') {
      throw new Error(reproductionSignal);
    }

    if (outcome.type === 'resolved') {
      await outcome.client.close();
      throw new Error(
        'Expected createMCPClient to reject when the SSE stream closes before an endpoint event, but it resolved.',
      );
    }

    const message =
      outcome.error instanceof Error
        ? outcome.error.message
        : String(outcome.error);

    if (!/clos(e|ed)/i.test(message) || !/endpoint/i.test(message)) {
      throw new Error(
        `Expected a connection-closed-before-endpoint error, received: ${message}`,
      );
    }

    console.log(
      'createMCPClient rejected after the SSE stream closed before an endpoint event.',
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
