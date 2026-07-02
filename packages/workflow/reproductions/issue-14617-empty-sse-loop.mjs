#!/usr/bin/env node

/**
 * Reproduction for vercel/ai issue #14617.
 *
 * Scenario: WorkflowChatTransport.reconnectToStream receives HTTP 200 responses
 * whose SSE bodies are empty. The reported bug is that these zero-progress
 * reconnects are treated as successful parses, so consecutiveErrors is reset
 * instead of incremented, causing an endless reconnect loop.
 *
 * Expected fixed behavior: with maxConsecutiveErrors: 3, the stream should fail
 * after 3 empty 200 responses that contain no chunks and no finish chunk.
 * Current buggy behavior: the first read remains pending and fetch is called
 * more than maxConsecutiveErrors times until this harness aborts it.
 */

import { WorkflowChatTransport } from '../dist/index.mjs';

const maxConsecutiveErrors = 3;
const abortController = new AbortController();
let fetchCalls = 0;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function emptySseResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => '',
    body: new ReadableStream({
      start(controller) {
        // A successful 200 response with an immediately-ended, empty SSE body.
        controller.close();
      },
    }),
  };
}

const transport = new WorkflowChatTransport({
  maxConsecutiveErrors,
  fetch: async (_url, init) => {
    if (init?.signal?.aborted) {
      throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    fetchCalls++;

    // Yield to the event loop so the watchdog below can abort the otherwise
    // unbounded loop deterministically without consuming excessive CPU.
    await delay(0);

    if (init?.signal?.aborted) {
      throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    return emptySseResponse();
  },
});

const stream = await transport.reconnectToStream({
  chatId: 'issue-14617-empty-sse-loop',
  abortSignal: abortController.signal,
});

const reader = stream.getReader();
const firstRead = reader.read();

const observed = await Promise.race([
  firstRead.then(
    value => ({ type: 'settled', value }),
    error => ({ type: 'rejected', error }),
  ),
  delay(100).then(() => ({ type: 'timeout' })),
]);

if (observed.type === 'timeout') {
  abortController.abort(new DOMException('Harness stopped endless loop', 'AbortError'));
  try {
    await firstRead;
  } catch {
    // Expected after the harness aborts the endless reconnect loop.
  }
}

if (fetchCalls > maxConsecutiveErrors) {
  console.error(
    `REPRODUCED issue #14617: empty 200 SSE responses caused ${fetchCalls} reconnect fetches ` +
      `without failing after maxConsecutiveErrors=${maxConsecutiveErrors}.`,
  );
  process.exit(1);
}

if (observed.type === 'rejected') {
  const message = observed.error instanceof Error ? observed.error.message : String(observed.error);
  console.log(
    `Could not reproduce: stream rejected after ${fetchCalls} fetches with: ${message}`,
  );
  process.exit(0);
}

console.log(
  `Could not reproduce: first read settled after ${fetchCalls} fetches: ${JSON.stringify(observed)}`,
);
