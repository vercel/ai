import assert from 'node:assert/strict';
import {
  createMCPClient,
  type MCPTransport,
  type MCPTransportSendOptions,
} from '@ai-sdk/mcp';

async function main() {
  let pendingRequest:
    | {
        jsonrpc: '2.0';
        id: string | number;
      }
    | undefined;
  const uncaughtErrors: string[] = [];

  const transport: MCPTransport = {
    async start() {},
    async close() {
      this.onclose?.();
    },
    async send(message, _options?: MCPTransportSendOptions) {
      if (
        'method' in message &&
        'id' in message &&
        message.method === 'tools/call'
      ) {
        pendingRequest = message;
      }
    },
  };

  const client = await createMCPClient({
    transport,
    onUncaughtError: error => {
      uncaughtErrors.push(
        error instanceof Error ? error.message : String(error),
      );
    },
    initialInitializeResult: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'mock', version: '1' },
    },
  });

  const controller = new AbortController();
  const requestResult = client
    .callTool({
      name: 'run',
      arguments: {},
      options: { signal: controller.signal },
    })
    .then(
      () => 'resolved',
      error => (error instanceof Error ? error.message : String(error)),
    );

  controller.abort();

  assert.equal(
    await requestResult,
    'Request was aborted',
    'the cancelled request should reject as aborted',
  );
  assert.ok(pendingRequest, 'the tool request should have been sent');

  let escapedError: unknown;
  try {
    transport.onmessage?.({
      jsonrpc: '2.0',
      id: pendingRequest.id,
      result: {
        content: [{ type: 'text', text: 'finished' }],
      },
    });
  } catch (error) {
    escapedError = error;
  }

  await client.close();

  if (escapedError !== undefined) {
    assert.match(
      escapedError instanceof Error
        ? escapedError.message
        : String(escapedError),
      /Protocol error: Received a response for an unknown message ID/,
      'the escaped error should be the reported late-response protocol error',
    );
    console.error(
      'ISSUE_22639_REPRODUCED: a late response after cancellation escaped transport.onmessage and bypassed onUncaughtError',
    );
    assert.deepEqual(
      uncaughtErrors,
      [],
      'the reported escaped error should bypass onUncaughtError',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
