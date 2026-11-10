import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { APICallError, StreamProviderError, streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

// Core retry-policy reproduction: no external API or provider parser is involved.
// A temporarily overloaded model becomes healthy after a real elapsed interval.
async function run({
  name,
  recoveryMs,
  requestStart = false,
  headers = {},
  streamRetries = 3,
  callbackRetry = false,
  callbackDelayMs = 0,
  retryable = true,
  abortAfterMs,
}: {
  name: string;
  recoveryMs: number;
  requestStart?: boolean;
  headers?: Record<string, string>;
  streamRetries?: number;
  callbackRetry?: boolean;
  callbackDelayMs?: number;
  retryable?: boolean;
  abortAfterMs?: number;
}) {
  const calls: number[] = [];
  const callbacks: number[] = [];
  const callbackEnds: number[] = [];
  const errors: unknown[] = [];
  const abortController = new AbortController();
  let firstCall = 0;
  let abortTimer: ReturnType<typeof setTimeout> | undefined;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const now = performance.now();
      if (calls.length === 0) {
        firstCall = now;
      }
      calls.push(now - firstCall);
      const overloaded = now - firstCall < recoveryMs;
      if (overloaded && requestStart) {
        throw new APICallError({
          message: 'Temporary overload',
          url: 'https://model.invalid',
          requestBodyValues: {},
          statusCode: 503,
          responseHeaders: headers,
        });
      }
      const parts: LanguageModelV4StreamPart[] = overloaded
        ? [
            {
              type: 'error',
              error: new StreamProviderError({
                message: 'Temporary overload',
                statusCode: retryable ? 503 : 400,
                isRetryable: retryable,
              }),
            },
          ]
        : [
            { type: 'text-start', id: 'text' },
            { type: 'text-delta', id: 'text', delta: 'hello' },
            { type: 'text-end', id: 'text' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ];
      return {
        response: { headers },
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(part);
            }
            controller.close();
          },
        }),
      };
    },
  });

  let text = '';
  let aborted = false;
  try {
    const result = streamText({
      model,
      prompt: 'say hello',
      maxRetries: requestStart ? 3 : 0,
      streamRetries,
      abortSignal: abortController.signal,
      onAbort: () => {
        aborted = true;
      },
      onError: async () => {
        callbacks.push(performance.now() - firstCall);
        if (abortAfterMs != null && abortTimer == null) {
          abortTimer = setTimeout(() => abortController.abort(), abortAfterMs);
        }
        if (callbackDelayMs > 0) {
          await sleep(callbackDelayMs);
        }
        callbackEnds.push(performance.now() - firstCall);
        if (callbackRetry) {
          return { retry: true };
        }
      },
    });
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
      } else if (part.type === 'error') {
        errors.push(part.error);
      }
    }
  } finally {
    clearTimeout(abortTimer);
  }
  console.log(
    JSON.stringify({
      name,
      text,
      callsMs: calls.map(Math.round),
      callbacksMs: callbacks.map(Math.round),
      callbackEndsMs: callbackEnds.map(Math.round),
      terminalErrors: errors.length,
      aborted,
    }),
  );
  return { text, calls, callbacks, callbackEnds, errors, aborted };
}

async function main() {
  // Control: the same recovery window succeeds with request-start backoff.
  const control = await run({
    name: 'request-start control: default 2s then 4s',
    recoveryMs: 2500,
    requestStart: true,
  });
  assert.equal(control.text, 'hello', 'Request-start recovery control failed');

  const defaultRetry = await run({
    name: 'stream recovery: default backoff',
    recoveryMs: 2500,
  });
  const retryAfter = await run({
    name: 'stream recovery: retry-after',
    recoveryMs: 750,
    headers: { 'retry-after': '1' },
  });
  const retryAfterMs = await run({
    name: 'stream recovery: retry-after-ms',
    recoveryMs: 750,
    headers: { 'retry-after-ms': '1000' },
  });
  const callback = await run({
    name: 'stream recovery: callback-directed retry',
    recoveryMs: 750,
    streamRetries: 0,
    callbackRetry: true,
  });

  // Secondary observations do not determine the primary failure signal.
  await run({
    name: 'abort 100ms after onError: should interrupt retry wait',
    recoveryMs: 2500,
    abortAfterMs: 100,
  });
  await run({
    name: 'nonretryable error: report suggests avoiding retries',
    recoveryMs: Number.POSITIVE_INFINITY,
    retryable: false,
  });
  const workaround = await run({
    name: 'awaited onError delay workaround',
    recoveryMs: 750,
    callbackDelayMs: 1000,
  });
  assert.equal(workaround.text, 'hello', 'Awaited onError workaround failed');
  assert.ok(
    workaround.calls[1] >= workaround.callbackEnds[0],
    'Re-dial occurred before onError completed',
  );

  // No assertion requires a specific buggy event sequence or attempt count.
  // A valid backoff implementation recovers all four streams and passes.
  const failed = [defaultRetry, retryAfter, retryAfterMs, callback].filter(
    result => result.text !== 'hello',
  );
  assert.equal(
    failed.length,
    0,
    'ISSUE_24524: stream retry budget exhausted before temporary overload recovered',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
