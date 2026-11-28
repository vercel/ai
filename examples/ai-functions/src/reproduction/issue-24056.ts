import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { generateText } from '../../../../packages/ai/dist/index.js';
import {
  createGateway,
  GatewayError,
} from '../../../../packages/gateway/dist/index.js';
import { isAbortError } from '../../../../packages/provider-utils/dist/index.js';

// Transport-only reproduction: the local endpoint never sends any response.
// Use this checkout's built public exports, not a newer registry release.
async function main() {
  let requests = 0;
  const server = http.createServer(request => {
    requests++;
    request.resume();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}/v1/ai`;
  const gateway = createGateway({ apiKey: 'test', baseURL });
  const model = gateway('openai/gpt-4o-mini');
  const identityFailures: string[] = [];
  const fabricatedFailures: string[] = [];

  async function run(
    label: string,
    kind: 'timeout' | 'abort',
    action: (signal: AbortSignal) => PromiseLike<unknown>,
    native = false,
    delay = 300,
  ) {
    const controller = new AbortController();
    const signal =
      kind === 'timeout' ? AbortSignal.timeout(delay) : controller.signal;
    const timer =
      kind === 'abort'
        ? setTimeout(() => {
            controller.abort();
          }, delay)
        : undefined;
    const before = requests;
    let caught: unknown;
    try {
      await action(signal);
    } catch (error) {
      caught = error;
    } finally {
      clearTimeout(timer);
    }
    assert.ok(signal.aborted, `${label}: signal must have fired`);
    assert.ok(
      requests > before,
      `${label}: local server must receive the request`,
    );
    assert.equal(
      signal.reason.name,
      kind === 'timeout' ? 'TimeoutError' : 'AbortError',
    );
    assert.ok(caught instanceof Error, `${label}: cancellation must reject`);
    console.log(
      `${label}: ${caught.name}; statusCode=${
        GatewayError.isInstance(caught) ? caught.statusCode : 'none'
      }; isRetryable=${
        GatewayError.isInstance(caught) ? caught.isRetryable : 'none'
      }; isAbortError=${isAbortError(caught)}; sameReason=${caught === signal.reason}`,
    );
    console.log(`  message: ${caught.message}`);
    console.log(
      `  cause: ${caught.cause instanceof Error ? caught.cause.name : 'none'}`,
    );
    if (native) {
      assert.equal(
        caught,
        signal.reason,
        'Native fetch must preserve cancellation',
      );
      assert.ok(isAbortError(caught));
      return;
    }
    if (
      GatewayError.isInstance(caught) &&
      caught.name === 'GatewayResponseError' &&
      caught.statusCode === 500 &&
      caught.isRetryable
    ) {
      fabricatedFailures.push(label);
    }
    if (caught !== signal.reason || !isAbortError(caught)) {
      identityFailures.push(label);
    }
  }

  try {
    for (const kind of ['timeout', 'abort'] as const) {
      await run(
        `native fetch ${kind}`,
        kind,
        signal =>
          fetch(`${baseURL}/language-model`, { method: 'POST', signal }),
        true,
      );
      for (const method of ['doGenerate', 'doStream'] as const) {
        await run(`${method} ${kind}`, kind, abortSignal =>
          model[method]({
            prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
            abortSignal,
          }),
        );
      }
    }
    await run(
      'generateText timeout 5000ms maxRetries=0',
      'timeout',
      abortSignal =>
        generateText({ model, prompt: 'hi', abortSignal, maxRetries: 0 }),
      false,
      5000,
    );
  } finally {
    server.closeAllConnections();
    const closed = once(server, 'close');
    server.close();
    await closed;
  }

  assert.equal(
    fabricatedFailures.length,
    0,
    `Caller cancellation was misreported as a retryable gateway 500: ${fabricatedFailures.join(', ')}`,
  );
  assert.equal(
    identityFailures.length,
    0,
    `Cancellation must preserve the original reason: ${identityFailures.join(', ')}`,
  );
  console.log('PASS: all cancellations preserve their original reason');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
