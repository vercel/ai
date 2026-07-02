#!/usr/bin/env node
/**
 * Reproduction for vercel/ai issue #16580.
 *
 * Expected/fixed behavior: aborting an in-flight MCP callTool request rejects
 * with "Request was aborted" and removes the response handler.
 *
 * Current buggy behavior in @ai-sdk/mcp 2.0.5: the callTool promise remains
 * pending and DefaultMCPClient.responseHandlers retains the handler.
 *
 * Run from the repository root after building packages:
 *   node packages/mcp/reproductions/issue-16580.mjs
 */
import { createMCPClient } from '../dist/index.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class HangingToolCallTransport {
  onclose;
  onerror;
  onmessage;
  sentMessages = [];

  async start() {}

  async send(message) {
    this.sentMessages.push(message);

    if (message.method === 'initialize') {
      queueMicrotask(() => {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'issue-16580-server', version: '1.0.0' },
          },
        });
      });
      return;
    }

    if (message.method === 'tools/call') {
      // This is the reported slow/hung MCP server behavior: the request has
      // been accepted by the transport but no JSON-RPC response is ever sent.
      return;
    }
  }

  async close() {
    this.onclose?.();
  }
}

const transport = new HangingToolCallTransport();
const client = await createMCPClient({ transport });

if (client.responseHandlers?.size !== 0) {
  throw new Error(
    `Unexpected handler count after initialize: ${client.responseHandlers?.size}`,
  );
}

const controller = new AbortController();
let settled = { state: 'pending' };

const callToolPromise = client.callTool({
  name: 'x',
  arguments: {},
  options: { signal: controller.signal },
});

callToolPromise.then(
  value => {
    settled = { state: 'fulfilled', value };
  },
  error => {
    settled = { state: 'rejected', error };
  },
);

await delay(0);

if (!transport.sentMessages.some(message => message.method === 'tools/call')) {
  throw new Error('tools/call was not sent');
}

const handlerCountBeforeAbort = client.responseHandlers?.size;
controller.abort(new Error('issue-16580 abort reason'));
await delay(100);
const handlerCountAfterAbort = client.responseHandlers?.size;

if (
  settled.state === 'rejected' &&
  settled.error?.message === 'Request was aborted' &&
  handlerCountAfterAbort === 0
) {
  console.log('Fixed behavior observed: callTool rejected on abort and cleaned up.');
  await client.close();
  process.exit(0);
}

if (settled.state === 'pending' && handlerCountAfterAbort === 1) {
  console.error(
    'Issue #16580 reproduced: callTool remained pending after abort and leaked its response handler.',
  );
  console.error(
    JSON.stringify(
      {
        handlerCountBeforeAbort,
        handlerCountAfterAbort,
        settledState: settled.state,
      },
      null,
      2,
    ),
  );
  // Keep the failing state visible to maintainers, then close so the script can exit.
  await client.close();
  process.exit(1);
}

console.error('Unexpected behavior while checking issue #16580.');
console.error(
  JSON.stringify(
    {
      handlerCountBeforeAbort,
      handlerCountAfterAbort,
      settledState: settled.state,
      rejectionMessage: settled.error?.message,
    },
    null,
    2,
  ),
);
await client.close();
process.exit(2);
