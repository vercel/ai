import assert from 'node:assert/strict';
import {
  type ChatTransport,
  DefaultChatTransport,
  TextStreamChatTransport,
  type UIMessage,
} from 'ai';

const chatId = 'chat-1';
const api = '/api/chat/';
const expectedReconnectUrl = '/api/chat/chat-1/stream';
const buggyReconnectUrl = '/api/chat//chat-1/stream';

async function captureRequests(
  createTransport: (fetch: typeof globalThis.fetch) => ChatTransport<UIMessage>,
) {
  const requests: Array<{ method: string | undefined; url: string }> = [];
  const transport = createTransport(async (input, init) => {
    requests.push({ method: init?.method, url: String(input) });
    return init?.method === 'GET'
      ? new Response(null, { status: 204 })
      : new Response('ok');
  });

  await transport.sendMessages({
    chatId,
    messages: [],
    trigger: 'submit-message',
    messageId: undefined,
    abortSignal: undefined,
  });
  await transport.reconnectToStream({ chatId });

  return requests;
}

async function main() {
  const results = await Promise.all([
    captureRequests(
      fetch => new DefaultChatTransport<UIMessage>({ api, fetch }),
    ),
    captureRequests(
      fetch => new TextStreamChatTransport<UIMessage>({ api, fetch }),
    ),
  ]);

  const labels = ['DefaultChatTransport', 'TextStreamChatTransport'];
  const malformedReconnects: string[] = [];

  for (const [index, requests] of results.entries()) {
    const label = labels[index];
    assert.deepEqual(requests[0], { method: 'POST', url: api });
    assert.equal(requests[1]?.method, 'GET');

    const reconnectUrl = requests[1]?.url;
    if (reconnectUrl === buggyReconnectUrl) {
      malformedReconnects.push(`${label}: ${reconnectUrl}`);
      continue;
    }
    assert.equal(reconnectUrl, expectedReconnectUrl);
  }

  if (malformedReconnects.length > 0) {
    console.error(
      'ISSUE_22098: reconnect URL contains a double slash before the chat ID\n' +
        malformedReconnects.map(result => `- ${result}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22098 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
