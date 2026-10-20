// Run after building @ai-sdk/workflow:
// node packages/workflow/reproductions/issue-14617-empty-sse-loop.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { WorkflowChatTransport } from '../dist/client.js';

let requests = 0;
const server = createServer((_request, response) => {
  requests++;
  // Bound the reproduction if the transport still retries indefinitely.
  if (requests > 10) {
    response.writeHead(503);
    response.end('Exceeded reconnect request limit');
    return;
  }
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end();
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');

try {
  const transport = new WorkflowChatTransport({
    api: `http://127.0.0.1:${server.address().port}/api/chat`,
  });
  const stream = await transport.reconnectToStream({ chatId: 'test-chat' });
  await assert.rejects(
    stream.getReader().read(),
    /Failed to reconnect after 3 consecutive errors/,
  );
  assert.equal(requests, 3);
  console.log(`PASS: stopped after ${requests} empty successful SSE responses`);
} catch (error) {
  console.error(`FAIL: made ${requests} reconnect requests`);
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}
