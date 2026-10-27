import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createGateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';

async function main() {
  // Transport reproduction: accept real HTTP requests but send no response.
  let requests = 0;
  const server = createServer(() => {
    requests++;
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}/v1/ai`;
  const gateway = createGateway({ apiKey: 'test', baseURL });
  const model = gateway('openai/gpt-4o-mini');
  const failures: string[] = [];
  let watchdogExpired = false;
  const watchdog = setTimeout(() => {
    watchdogExpired = true;
    server.closeAllConnections();
  }, 15_000);

  async function run(
    label: string,
    kind: 'timeout' | 'abort',
    call: (signal: AbortSignal) => PromiseLike<unknown>,
    direct = false,
    delay = 300,
  ) {
    const controller = new AbortController();
    const signal =
      kind === 'timeout' ? AbortSignal.timeout(delay) : controller.signal;
    const timer =
      kind === 'abort'
        ? setTimeout(() => controller.abort(), delay)
        : undefined;
    const before = requests;
    let caught: unknown;
    try {
      await call(signal);
    } catch (error) {
      caught = error;
    } finally {
      clearTimeout(timer);
    }
    assert.ok(!watchdogExpired, 'Infrastructure watchdog expired');
    assert.ok(
      requests > before,
      `${label}: local server must receive the request`,
    );
    assert.ok(signal.aborted, `${label}: cancellation must have fired`);
    assert.equal(
      signal.reason.name,
      kind === 'timeout' ? 'TimeoutError' : 'AbortError',
    );
    const error = caught as
      | (Error & { statusCode?: number; isRetryable?: boolean; cause?: Error })
      | undefined;
    console.log(
      `${label}: ${error?.name} statusCode=${error?.statusCode} isRetryable=${error?.isRetryable} cause=${error?.cause?.name}; ${error?.message}`,
    );
    if (direct) {
      assert.equal(
        caught,
        signal.reason,
        'Native fetch must preserve the reason',
      );
    } else if (caught !== signal.reason) {
      failures.push(label);
    }
  }

  try {
    for (const kind of ['timeout', 'abort'] as const) {
      await run(
        `fetch/${kind}`,
        kind,
        signal =>
          fetch(`${baseURL}/language-model`, { method: 'POST', signal }),
        true,
      );
      for (const method of ['doGenerate', 'doStream'] as const) {
        await run(`${method}/${kind}`, kind, abortSignal =>
          model[method]({
            prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
            abortSignal,
          }),
        );
      }
    }
    // Production context from the follow-up: a 5s classification limit, no retries.
    await run(
      'generateText/timeout/maxRetries=0',
      'timeout',
      abortSignal =>
        generateText({ model, prompt: 'hi', abortSignal, maxRetries: 0 }),
      false,
      5000,
    );
  } finally {
    clearTimeout(watchdog);
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

  assert.equal(
    failures.length,
    0,
    `Gateway cancellation was not preserved: ${failures.join(', ')}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
