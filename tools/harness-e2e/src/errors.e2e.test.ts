import type { HttpHandler } from 'harness-http-proxy';
import { describe, expect, it } from 'vitest';
import { withReplayScenarioAgent } from './e2e-scenario';
import { shouldRunSyntheticScenario } from './e2e-shared';
import { REPLAY_ADAPTERS } from './replay-adapters';

/*
 * Tier-A error-normalization suite. Unlike the recorded scenarios, these inject
 * an always-synthetic handler (no fixture, never recorded): the model route
 * returns a 401 (invalid credentials) or 404 (unknown model), telemetry routes
 * stay benign so the real CLI reaches the model call. The turn must surface a
 * terminal error — all three adapters reject the `generate` promise rather than
 * exposing a `finishReason: 'error'`. We also assert the error does not echo the
 * bearer credential.
 *
 * Note: which adapters reject *cleanly* on unknown-model is only knowable from a
 * live run (the original marked claude-code + pi as known gaps). If an adapter
 * does not reject, switch its `it` to `it.fails` and record the gap.
 */
const SCENARIO_TIMEOUT_MS = 120_000;

const isModelRoute = (url: URL): boolean =>
  /\/(messages|responses|chat\/completions)\b/.test(url.pathname);

function createErrorHandler(opts: {
  status: number;
  errorType: string;
  message: string;
}): HttpHandler {
  return request => {
    let modelRoute = false;
    try {
      modelRoute = isModelRoute(new URL(request.url));
    } catch {
      modelRoute = false;
    }
    if (!modelRoute) {
      // Telemetry / metrics / registry probes — keep the CLI bootstrap happy.
      return new Response(null, { status: 204 });
    }
    return Response.json(
      {
        type: 'error',
        error: { type: opts.errorType, message: opts.message },
        message: opts.message,
      },
      { status: opts.status },
    );
  };
}

async function expectNoSecretLeak(promise: Promise<unknown>): Promise<void> {
  let thrown: unknown;
  await expect(
    promise.catch(error => {
      thrown = error;
      throw error;
    }),
  ).rejects.toThrow();
  const text = String(
    thrown instanceof Error ? (thrown.stack ?? thrown.message) : thrown,
  );
  expect(text).not.toContain('Bearer ');
}

for (const adapter of REPLAY_ADAPTERS) {
  describe(`errors: ${adapter.name}`, () => {
    it.skipIf(!shouldRunSyntheticScenario())(
      'normalizes an authentication failure into a terminal error',
      async () => {
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'invalid-credentials',
            syntheticHandler: createErrorHandler({
              status: 401,
              errorType: 'authentication_error',
              message: 'invalid credentials',
            }),
          },
          async ({ agent, session }) => {
            await expectNoSecretLeak(
              agent.generate({ session, prompt: 'Reply with a single word.' }),
            );
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );

    it.skipIf(!shouldRunSyntheticScenario())(
      'normalizes an unknown-model failure into a terminal error',
      async () => {
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'unknown-model',
            syntheticHandler: createErrorHandler({
              status: 404,
              errorType: 'not_found_error',
              message: 'unknown model',
            }),
          },
          async ({ agent, session }) => {
            await expectNoSecretLeak(
              agent.generate({ session, prompt: 'Reply with a single word.' }),
            );
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );
  });
}
