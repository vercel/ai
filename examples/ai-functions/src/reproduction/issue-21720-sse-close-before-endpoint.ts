import { createServer } from 'node:http';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';

const MAX_SETTLEMENT_DELAY_MS = 500;

type ClientOutcome =
  | { type: 'resolved'; client: MCPClient }
  | { type: 'rejected'; error: unknown }
  | { type: 'pending' };

async function main() {
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/sse') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
      });
      response.end();
      return;
    }

    response.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Failed to determine the reproduction server port');
    }

    const clientPromise = createMCPClient({
      transport: {
        type: 'sse',
        url: `http://127.0.0.1:${address.port}/sse`,
      },
    });

    const outcome: ClientOutcome = await Promise.race([
      clientPromise.then(
        client => ({ type: 'resolved', client }) as const,
        error => ({ type: 'rejected', error }) as const,
      ),
      new Promise<{ type: 'pending' }>(resolve => {
        setTimeout(() => resolve({ type: 'pending' }), MAX_SETTLEMENT_DELAY_MS);
      }),
    ]);

    if (outcome.type === 'pending') {
      throw new Error(
        'ISSUE #21720 reproduced: createMCPClient stayed pending after the SSE stream closed before an endpoint event',
      );
    }

    if (outcome.type === 'resolved') {
      await outcome.client.close();
      throw new Error(
        'Expected createMCPClient to reject when the SSE stream closes before an endpoint event, but it resolved',
      );
    }

    const message =
      outcome.error instanceof Error
        ? outcome.error.message
        : String(outcome.error);

    if (!/closed/i.test(message) || !/endpoint/i.test(message)) {
      throw new Error(
        `Expected a rejection explaining that the SSE stream closed before the endpoint event, but received: ${message}`,
      );
    }

    console.log(
      'createMCPClient rejected after the SSE stream closed before an endpoint event',
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
  process.exitCode = 1;
});
