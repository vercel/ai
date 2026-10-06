import {
  DefaultChatTransport,
  TextStreamChatTransport,
  type UIMessage,
} from '../../../../packages/ai/src/index';

type TransportConstructor = new (options: {
  api: string;
  fetch: typeof fetch;
}) => DefaultChatTransport<UIMessage> | TextStreamChatTransport<UIMessage>;

async function captureReconnectUrl(
  Transport: TransportConstructor,
  api: string,
): Promise<string> {
  let requestedUrl: string | undefined;

  const transport = new Transport({
    api,
    fetch: async (input, init) => {
      requestedUrl = String(input);

      if (init?.method !== 'GET') {
        throw new Error(
          `Reconnect used ${String(init?.method)} instead of GET.`,
        );
      }

      return new Response(null, { status: 204 });
    },
  });

  await transport.reconnectToStream({ chatId: 'chat-1' });

  if (requestedUrl == null) {
    throw new Error('Reconnect did not issue a request.');
  }

  return requestedUrl;
}

async function captureSendUrl(
  Transport: TransportConstructor,
  api: string,
): Promise<string> {
  let requestedUrl: string | undefined;

  const transport = new Transport({
    api,
    fetch: async (input, init) => {
      requestedUrl = String(input);

      if (init?.method !== 'POST') {
        throw new Error(`Send used ${String(init?.method)} instead of POST.`);
      }

      return new Response('');
    },
  });

  await transport.sendMessages({
    chatId: 'chat-1',
    messageId: 'message-1',
    trigger: 'submit-message',
    messages: [],
  });

  if (requestedUrl == null) {
    throw new Error('Send did not issue a request.');
  }

  return requestedUrl;
}

async function main() {
  const transports = [
    ['DefaultChatTransport', DefaultChatTransport],
    ['TextStreamChatTransport', TextStreamChatTransport],
  ] as const;
  const reconnectFailures: string[] = [];

  for (const [name, Transport] of transports) {
    const withoutTrailingSlash = await captureReconnectUrl(
      Transport,
      '/api/chat',
    );
    const withTrailingSlash = await captureReconnectUrl(
      Transport,
      '/api/chat/',
    );
    const withTrailingSlashAndQuery = await captureReconnectUrl(
      Transport,
      '/api/chat/?mode=demo#section',
    );
    const sendUrl = await captureSendUrl(Transport, '/api/chat/');

    console.log(name, {
      withoutTrailingSlash,
      withTrailingSlash,
      withTrailingSlashAndQuery,
      sendUrl,
    });

    if (withoutTrailingSlash !== '/api/chat/chat-1/stream') {
      throw new Error(
        `${name} control reconnect URL was ${withoutTrailingSlash}.`,
      );
    }

    if (sendUrl !== '/api/chat/') {
      throw new Error(`${name} send URL was ${sendUrl}.`);
    }

    if (withTrailingSlash !== '/api/chat/chat-1/stream') {
      reconnectFailures.push(
        `${name} requested ${withTrailingSlash} instead of /api/chat/chat-1/stream`,
      );
    }

    if (
      withTrailingSlashAndQuery !== '/api/chat/chat-1/stream?mode=demo#section'
    ) {
      reconnectFailures.push(
        `${name} requested ${withTrailingSlashAndQuery} instead of /api/chat/chat-1/stream?mode=demo#section`,
      );
    }
  }

  if (reconnectFailures.length > 0) {
    throw new Error(
      `Issue #22098 reproduced: reconnect URL contains a duplicated slash.\n${reconnectFailures.join('\n')}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
