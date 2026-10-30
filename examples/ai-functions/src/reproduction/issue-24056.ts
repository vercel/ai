import assert from 'node:assert/strict';
import http from 'node:http';
import { createGateway, GatewayResponseError } from '@ai-sdk/gateway';
import { isAbortError } from '@ai-sdk/provider-utils';
import { generateText } from 'ai';

// Transport/runtime reproduction: the real local HTTP endpoint never responds.
// No gateway service, provider credentials, or synthetic fetch is involved.
async function main() {
  let requests = 0;
  const server = http.createServer(() => {
    requests++;
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}/v1/ai`;
  const gateway = createGateway({ apiKey: 'test', baseURL });
  const model = gateway('openai/gpt-4o-mini');
  const failures: string[] = [];

  async function check(
    label: string,
    kind: 'timeout' | 'abort',
    call: (signal: AbortSignal) => PromiseLike<unknown>,
    delay = 300,
  ) {
    const controller = new AbortController();
    const signal =
      kind === 'timeout' ? AbortSignal.timeout(delay) : controller.signal;
    const abortTimer =
      kind === 'abort'
        ? setTimeout(() => controller.abort(), delay)
        : undefined;
    const before = requests;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let observed: unknown;
    try {
      await Promise.race([
        call(signal),
        new Promise<never>((_, reject) => {
          watchdog = setTimeout(
            () => reject(new Error(`Harness deadline exceeded: ${label}`)),
            15_000,
          );
        }),
      ]);
      assert.fail(`${label}: request unexpectedly succeeded`);
    } catch (error) {
      observed = error;
    } finally {
      clearTimeout(abortTimer);
      clearTimeout(watchdog);
    }

    assert.equal(requests - before, 1, `${label}: real request must arrive`);
    assert.ok(signal.aborted, `${label}: caller signal must have aborted`);
    assert.ok(
      observed === signal.reason ||
        (GatewayResponseError.isInstance(observed) &&
          observed.statusCode === 500 &&
          observed.cause === signal.reason),
      `${label}: unexpected failure unrelated to reported cancellation wrapping`,
    );
    const error = observed as Error & {
      statusCode?: number;
      isRetryable?: boolean;
      cause?: Error;
    };
    console.log(
      `${label}: ${error.name} statusCode=${error.statusCode} isRetryable=${error.isRetryable} cause=${error.cause?.name}; ${error.message}`,
    );
    if (observed !== signal.reason || !isAbortError(observed)) {
      failures.push(label);
    }
  }

  try {
    // Compare the direct transport boundary before exercising SDK conversion.
    for (const kind of ['timeout', 'abort'] as const) {
      await check(`native fetch ${kind}`, kind, signal =>
        fetch(`${baseURL}/language-model`, { method: 'POST', signal }),
      );
    }
    assert.equal(failures.length, 0, 'Native fetch must preserve cancellation');

    for (const method of ['doGenerate', 'doStream'] as const) {
      for (const kind of ['timeout', 'abort'] as const) {
        await check(`${method} ${kind}`, kind, abortSignal =>
          model[method]({
            prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
            abortSignal,
          }),
        );
      }
    }
    await check(
      'generateText five-second timeout maxRetries=0',
      'timeout',
      abortSignal =>
        generateText({ model, prompt: 'hi', abortSignal, maxRetries: 0 }),
      5_000,
    );

    // Primary invariant (including the issue author's corrected expectation):
    // caller cancellations retain identity and are recognizable by isAbortError.
    // Error wording/status/retryability above are diagnostics, not preconditions.
    assert.equal(
      failures.length,
      0,
      `Caller cancellation was not preserved: ${failures.join(', ')}`,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
