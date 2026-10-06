import assert from 'node:assert/strict';
import {
  DefaultChatTransport,
  TextStreamChatTransport,
  type ChatTransport,
  type UIMessage,
} from 'ai';

const chatId = 'chat-1';
const expectedReconnectPath = '/api/chat/chat-1/stream';

type RequestRecord = {
  method: string | undefined;
  url: string;
};

async function captureRequests(
  createTransport: (
    fetch: typeof globalThis.fetch,
    api: string,
  ) => ChatTransport<UIMessage>,
  api: string,
) {
  const requests: RequestRecord[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    requests.push({
      method: init?.method,
      url: String(input),
    });

    return init?.method === 'GET'
      ? new Response(null, { status: 204 })
      : new Response(new Uint8Array(), { status: 200 });
  };
  const transport = createTransport(fetch, api);

  await transport.reconnectToStream({ chatId });

  return requests;
}

async function main() {
  const transportFactories = [
    {
      name: 'DefaultChatTransport',
      create: (fetch: typeof globalThis.fetch, api: string) =>
        new DefaultChatTransport({ api, fetch }),
    },
    {
      name: 'TextStreamChatTransport',
      create: (fetch: typeof globalThis.fetch, api: string) =>
        new TextStreamChatTransport({ api, fetch }),
    },
  ];
  const reconnectCases = [
    {
      api: '/api/chat',
      expected: expectedReconnectPath,
    },
    {
      api: '/api/chat/',
      expected: expectedReconnectPath,
    },
    {
      api: '/api/chat/?mode=demo#section',
      expected: `${expectedReconnectPath}?mode=demo#section`,
    },
  ];
  const observations: Array<{
    api: string;
    expected: string;
    method: string | undefined;
    transport: string;
    url: string | undefined;
  }> = [];

  for (const transportFactory of transportFactories) {
    for (const reconnectCase of reconnectCases) {
      const requests = await captureRequests(
        transportFactory.create,
        reconnectCase.api,
      );
      const request = requests[0];

      assert.equal(requests.length, 1);
      assert.equal(request?.method, 'GET');
      observations.push({
        transport: transportFactory.name,
        api: reconnectCase.api,
        method: request?.method,
        url: request?.url,
        expected: reconnectCase.expected,
      });
    }

    const sendRequests: RequestRecord[] = [];
    const transport = transportFactory.create(async (input, init) => {
      sendRequests.push({
        method: init?.method,
        url: String(input),
      });
      return new Response(new Uint8Array(), { status: 200 });
    }, '/api/chat/');

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId,
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    });

    assert.deepEqual(sendRequests, [
      {
        method: 'POST',
        url: '/api/chat/',
      },
    ]);
  }

  console.log(JSON.stringify(observations, null, 2));

  try {
    for (const observation of observations) {
      assert.equal(
        observation.url,
        observation.expected,
        `${observation.transport} should request the reconnect route without a duplicated slash`,
      );
    }
  } catch (error) {
    if (error instanceof assert.AssertionError) {
      throw new Error(
        'ISSUE_22098_RECONNECT_URL_MISMATCH: reconnect URL did not normalize the configured trailing slash.',
      );
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
