import {
  APICallError,
  type LanguageModelV4CallOptions,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import assert from 'node:assert/strict';
import { StreamProviderError } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const partialHead: LanguageModelV4StreamPart[] = [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 'text' },
  { type: 'text-delta', id: 'text', delta: 'partial ' },
];

const successfulStream = () =>
  convertArrayToReadableStream<LanguageModelV4StreamPart>([
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: 'recovered' },
    { type: 'text-end', id: 'text' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
  ]);

class ReproducedBugError extends Error {}

function retryableApiError(message: string) {
  return new APICallError({
    message,
    url: 'https://example.test/model',
    requestBodyValues: {},
    statusCode: 503,
    responseHeaders: { 'retry-after-ms': '1' },
    isRetryable: true,
  });
}

async function checkThrownReadFailure() {
  let calls = 0;
  const chunks: Array<{ type: string }> = [];
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream:
        ++calls > 1
          ? successfulStream()
          : new ReadableStream<LanguageModelV4StreamPart>({
              start(controller) {
                for (const part of partialHead) controller.enqueue(part);
                setTimeout(
                  () =>
                    controller.error(
                      retryableApiError(
                        'Failed to process successful response',
                      ),
                    ),
                  10,
                );
              },
            }),
    }),
  });
  const agent = new WorkflowAgent({ model, maxRetries: 2 });

  let result: Awaited<ReturnType<(typeof agent)['stream']>> | undefined;
  let rejection: unknown;
  try {
    result = await agent.stream({
      messages: [{ role: 'user', content: 'hi' }],
      writable: new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    });
  } catch (error) {
    rejection = error;
  }

  if (
    calls === 1 &&
    APICallError.isInstance(rejection) &&
    rejection.isRetryable
  ) {
    return {
      reproduced: true,
      calls,
      rejection: {
        name: rejection.name,
        isRetryable: rejection.isRetryable,
      },
      chunkTypes: chunks.map(chunk => chunk.type),
    };
  }

  if (rejection != null) throw rejection;
  assert.equal(
    calls,
    2,
    'retryable post-open read failure was not retried once',
  );
  assert.equal(
    result?.steps.at(-1)?.text,
    'recovered',
    'the retried model call did not complete the agent run',
  );
  return { reproduced: false, calls };
}

async function checkErrorPartFailure() {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream:
        ++calls > 1
          ? successfulStream()
          : convertArrayToReadableStream<LanguageModelV4StreamPart>([
              ...partialHead,
              {
                type: 'error',
                error: {
                  message: 'Service temporarily unavailable',
                  statusCode: 503,
                  isRetryable: true,
                },
              },
              {
                type: 'finish',
                finishReason: { unified: 'error', raw: 'error' },
                usage,
              },
            ]),
    }),
  });
  const agent = new WorkflowAgent({ model, maxRetries: 2 });
  const result = await agent.stream({
    messages: [{ role: 'user', content: 'hi' }],
  });

  if (
    calls === 1 &&
    StreamProviderError.isInstance(result.error) &&
    result.error.isRetryable &&
    result.finishReason === 'error'
  ) {
    return {
      reproduced: true,
      calls,
      resultError: {
        name: result.error.name,
        isRetryable: result.error.isRetryable,
      },
      finishReason: result.finishReason,
    };
  }

  assert.equal(calls, 2, 'retryable provider error part was not retried once');
  assert.equal(
    result.steps.at(-1)?.text,
    'recovered',
    'the retried provider error part did not complete the agent run',
  );
  assert.equal(
    'error' in result,
    false,
    'the recovered result still contains a terminal stream error',
  );
  return { reproduced: false, calls };
}

async function checkDispatchRetryControl() {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      calls++;
      if (calls < 3) throw retryableApiError('dispatch failed');
      return { stream: successfulStream() };
    },
  });
  const agent = new WorkflowAgent({ model, maxRetries: 2 });
  const result = await agent.stream({
    messages: [{ role: 'user', content: 'hi' }],
  });

  assert.equal(calls, 3, 'control dispatch failures did not use maxRetries');
  assert.equal(result.steps.at(-1)?.text, 'recovered');
  return { calls, text: result.steps.at(-1)?.text };
}

function silentStream(options: LanguageModelV4CallOptions) {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      options.abortSignal?.addEventListener(
        'abort',
        () => controller.error(options.abortSignal?.reason),
        { once: true },
      );
    },
  });
}

async function checkSilentStreamWithoutTimeout() {
  let calls = 0;
  const controller = new AbortController();
  const model = new MockLanguageModelV4({
    doStream: async options => {
      calls++;
      return { stream: silentStream(options) };
    },
  });
  const agent = new WorkflowAgent({ model, maxRetries: 2 });
  const operation = agent.stream({
    messages: [{ role: 'user', content: 'hi' }],
    abortSignal: controller.signal,
  });

  const state = await Promise.race([
    operation.then(() => 'settled' as const),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), 50)),
  ]);
  controller.abort();
  const stateAfterAbort = await Promise.race([
    operation.then(() => 'settled' as const),
    new Promise<'pending'>(resolve =>
      setTimeout(() => resolve('pending'), 100),
    ),
  ]);

  return { calls, state, stateAfterAbort };
}

async function checkSilentStreamWithTimeout() {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doStream: async options => {
      calls++;
      return { stream: silentStream(options) };
    },
  });
  const agent = new WorkflowAgent({ model, maxRetries: 2 });
  const operation = agent.stream({
    messages: [{ role: 'user', content: 'hi' }],
    timeout: 50,
  });
  const outcome = await Promise.race([
    operation.then(result => ({ state: 'settled' as const, result })),
    new Promise<{ state: 'pending' }>(resolve =>
      setTimeout(() => resolve({ state: 'pending' }), 300),
    ),
  ]);

  return outcome.state === 'pending'
    ? { calls, state: outcome.state }
    : {
        calls,
        state: outcome.state,
        steps: outcome.result.steps.length,
        hasError: 'error' in outcome.result,
      };
}

async function main() {
  const thrownRead = await checkThrownReadFailure();
  const errorPart = await checkErrorPartFailure();
  const dispatchControl = await checkDispatchRetryControl();
  const silentWithoutTimeout = await checkSilentStreamWithoutTimeout();
  const silentWithTimeout = await checkSilentStreamWithTimeout();

  console.log(
    JSON.stringify(
      {
        thrownRead,
        errorPart,
        dispatchControl,
        silentWithoutTimeout,
        silentWithTimeout,
      },
      null,
      2,
    ),
  );

  if (thrownRead.reproduced || errorPart.reproduced) {
    throw new ReproducedBugError(
      'ISSUE #22379 REPRODUCED: retryable post-open stream failures were not retried',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
