#!/usr/bin/env node
import { createMCPClient } from '../dist/index.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class HangingToolCallTransport {
  onmessage;
  onerror;
  onclose;
  sent = [];

  async start() {}

  async send(message) {
    this.sent.push(message);

    if ('id' in message && message.method === 'initialize') {
      // Reply to initialize so createMCPClient completes successfully.
      queueMicrotask(() => {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'issue-16580-repro', version: '1.0.0' },
          },
        });
      });
      return;
    }

    if ('id' in message && message.method === 'tools/call') {
      // This is the reported failure mode: the request has been sent, but the
      // slow/hung MCP server never sends the matching JSON-RPC response.
      return;
    }
  }

  async close() {
    this.onclose?.();
  }
}

const transport = new HangingToolCallTransport();
const client = await createMCPClient({ transport });

const abortController = new AbortController();
let settled = false;
let rejection;

const callPromise = client
  .callTool({
    name: 'x',
    arguments: {},
    options: { signal: abortController.signal },
  })
  .then(
    value => {
      settled = true;
      return value;
    },
    error => {
      settled = true;
      rejection = error;
      return undefined;
    },
  );

// Wait until tools/call has definitely been written to the transport, then abort.
for (let i = 0; i < 50; i++) {
  if (transport.sent.some(message => message.method === 'tools/call')) break;
  await sleep(10);
}

const sentToolCall = transport.sent.some(message => message.method === 'tools/call');
if (!sentToolCall) {
  console.error('Setup failed: tools/call was never sent to the transport.');
  process.exit(2);
}

abortController.abort(new Error('repro abort after send'));
await sleep(100);

const responseHandlers = client.responseHandlers;
const leakedHandlerCount = responseHandlers?.size;

if (!settled && leakedHandlerCount === 1) {
  console.error(
    'Reproduced issue #16580: callTool did not settle after abort and one response handler remains registered.',
  );
  console.error(`settled=${settled}; responseHandlers.size=${leakedHandlerCount}`);
  // Attach a final handler and close only after recording the leaked state, so
  // the process can terminate without an unhandled rejection.
  callPromise.catch(() => {});
  await client.close();
  process.exit(1);
}

await client.close();

if (settled && rejection?.message === 'Request was aborted' && leakedHandlerCount === 0) {
  console.log('Issue #16580 appears fixed: callTool rejected on abort and cleaned up its response handler.');
  process.exit(0);
}

console.error('Unexpected result while exercising issue #16580.');
console.error(
  JSON.stringify(
    {
      settled,
      rejectionName: rejection?.name,
      rejectionMessage: rejection?.message,
      leakedHandlerCount,
      sentMethods: transport.sent.map(message => message.method ?? 'notification'),
    },
    null,
    2,
  ),
);
process.exit(2);
