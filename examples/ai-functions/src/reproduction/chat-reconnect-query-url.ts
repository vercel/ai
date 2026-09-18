import { once } from 'node:events';
import { createServer } from 'node:http';
import {
  DefaultChatTransport,
  TextStreamChatTransport,
  type UIMessage,
} from 'ai';

type TransportName = 'DefaultChatTransport' | 'TextStreamChatTransport';

const transportNames: TransportName[] = [
  'DefaultChatTransport',
  'TextStreamChatTransport',
];

function createTransport(
  name: TransportName,
  options: ConstructorParameters<typeof DefaultChatTransport<UIMessage>>[0],
) {
  return name === 'DefaultChatTransport'
    ? new DefaultChatTransport(options)
    : new TextStreamChatTransport(options);
}

function requestTarget(input: RequestInfo | URL): string {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    'http://reproduction.local',
  );
  return `${url.pathname}${url.search}`;
}

async function main() {
  const observedRequests: string[] = [];
  const server = createServer((request, response) => {
    const target = request.url ?? '';
    observedRequests.push(target);

    if (
      request.method === 'POST' &&
      new URL(target, 'http://reproduction.local').pathname === '/api/chat'
    ) {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('sent');
      return;
    }

    if (
      request.method === 'GET' &&
      new URL(target, 'http://reproduction.local').pathname ===
        '/api/chat/chat-1/stream'
    ) {
      if (
        new URL(target, 'http://reproduction.local').searchParams.has(
          'inactive',
        )
      ) {
        response.writeHead(204);
        response.end();
        return;
      }

      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('resumed');
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end(`route not found: ${target}`);
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Failed to start the loopback reproduction server.');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  const primaryFailures: string[] = [];
  let controlCount = 0;

  try {
    const queryCases = [
      '?mode=demo',
      '?mode=demo&locale=en',
      '?mode=a%2Fb',
      '?mode=demo#section',
    ];

    for (const transportName of transportNames) {
      for (const query of queryCases) {
        const api = `${origin}/api/chat${query}`;
        const expectedUrl = new URL(api);
        expectedUrl.pathname = `${expectedUrl.pathname}/chat-1/stream`;
        const expectedTarget = `${expectedUrl.pathname}${expectedUrl.search}`;
        const requestIndex = observedRequests.length;
        let error: unknown;
        let stream: ReadableStream<unknown> | null | undefined;

        try {
          stream = await createTransport(transportName, {
            api,
          }).reconnectToStream({
            chatId: 'chat-1',
          });
        } catch (caughtError) {
          error = caughtError;
        }

        const actualTarget = observedRequests[requestIndex];
        if (
          actualTarget === expectedTarget &&
          stream != null &&
          error == null
        ) {
          continue;
        }

        if (actualTarget !== expectedTarget && error != null) {
          primaryFailures.push(
            `${transportName} requested ${actualTarget} instead of ${expectedTarget}`,
          );
          continue;
        }

        throw new Error(
          `${transportName} absolute reconnect failed for an unrelated reason: ` +
            `expected ${expectedTarget}, observed ${String(actualTarget)}, ` +
            `error=${String(error)}`,
        );
      }
    }

    for (const transportName of transportNames) {
      let actualTarget: string | undefined;
      let error: unknown;
      let stream: ReadableStream<unknown> | null | undefined;

      try {
        stream = await createTransport(transportName, {
          api: '/api/chat?mode=demo',
          fetch: async input => {
            actualTarget = requestTarget(input);
            return actualTarget === '/api/chat/chat-1/stream?mode=demo'
              ? new Response('resumed')
              : new Response('route not found', { status: 404 });
          },
        }).reconnectToStream({
          chatId: 'chat-1',
        });
      } catch (caughtError) {
        error = caughtError;
      }

      if (
        actualTarget === '/api/chat/chat-1/stream?mode=demo' &&
        stream != null &&
        error == null
      ) {
        continue;
      }

      if (
        actualTarget !== '/api/chat/chat-1/stream?mode=demo' &&
        error != null
      ) {
        primaryFailures.push(
          `${transportName} requested relative ${String(actualTarget)} instead of ` +
            '/api/chat/chat-1/stream?mode=demo',
        );
        continue;
      }

      throw new Error(
        `${transportName} relative reconnect failed for an unrelated reason: ` +
          `observed ${String(actualTarget)}, error=${String(error)}`,
      );
    }

    for (const transportName of transportNames) {
      const requestIndex = observedRequests.length;
      const stream = await createTransport(transportName, {
        api: `${origin}/api/chat?mode=demo`,
      }).sendMessages({
        chatId: 'chat-1',
        messages: [],
        trigger: 'submit-message',
        messageId: undefined,
        abortSignal: undefined,
      });
      const actualTarget = observedRequests[requestIndex];
      if (actualTarget !== '/api/chat?mode=demo' || stream == null) {
        throw new Error(
          `${transportName} send control failed: observed ${String(actualTarget)}`,
        );
      }
      controlCount++;
    }

    for (const transportName of transportNames) {
      const requestIndex = observedRequests.length;
      const stream = await createTransport(transportName, {
        api: `${origin}/api/chat`,
      }).reconnectToStream({
        chatId: 'chat-1',
      });
      const actualTarget = observedRequests[requestIndex];
      if (actualTarget !== '/api/chat/chat-1/stream' || stream == null) {
        throw new Error(
          `${transportName} query-free reconnect control failed: observed ${String(actualTarget)}`,
        );
      }
      controlCount++;
    }

    for (const transportName of transportNames) {
      const requestIndex = observedRequests.length;
      const stream = await createTransport(transportName, {
        api: `${origin}/api/chat?mode=demo`,
        prepareReconnectToStreamRequest: () => ({
          api: `${origin}/api/chat/chat-1/stream?mode=demo`,
        }),
      }).reconnectToStream({
        chatId: 'chat-1',
      });
      const actualTarget = observedRequests[requestIndex];
      if (
        actualTarget !== '/api/chat/chat-1/stream?mode=demo' ||
        stream == null
      ) {
        throw new Error(
          `${transportName} reconnect override control failed: observed ${String(actualTarget)}`,
        );
      }
      controlCount++;
    }

    for (const transportName of transportNames) {
      let actualTarget: string | undefined;
      const stream = await createTransport(transportName, {
        fetch: async input => {
          actualTarget = requestTarget(input);
          return new Response('resumed');
        },
      }).reconnectToStream({
        chatId: 'chat-1',
      });
      if (actualTarget !== '/api/chat/chat-1/stream' || stream == null) {
        throw new Error(
          `${transportName} default API control failed: observed ${String(actualTarget)}`,
        );
      }
      controlCount++;
    }

    for (const transportName of transportNames) {
      const result = await createTransport(transportName, {
        api: `${origin}/api/chat?inactive=true`,
        prepareReconnectToStreamRequest: () => ({
          api: `${origin}/api/chat/chat-1/stream?inactive=true`,
        }),
      }).reconnectToStream({
        chatId: 'chat-1',
      });
      if (result !== null) {
        throw new Error(`${transportName} 204 control did not return null.`);
      }
      controlCount++;
    }
  } finally {
    server.close();
    await once(server, 'close');
  }

  if (controlCount !== 10) {
    throw new Error(`Expected 10 passing controls, observed ${controlCount}.`);
  }

  if (primaryFailures.length > 0) {
    console.error(
      `ISSUE #21105 REPRODUCED: ${primaryFailures.length} reconnect requests appended the stream path inside query parameters.`,
    );
    for (const failure of primaryFailures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'All reconnect requests appended the stream path to the pathname and preserved query parameters.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
