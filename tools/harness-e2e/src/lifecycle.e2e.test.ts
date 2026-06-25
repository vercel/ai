import type { HttpHandler } from 'harness-http-proxy';
import { describe, expect, it } from 'vitest';
import { withReplayScenarioAgent } from './e2e-scenario';
import { shouldRunScenario, shouldRunSyntheticScenario } from './e2e-shared';
import { REPLAY_ADAPTERS } from './replay-adapters';

/*
 * Tier-A lifecycle suite. `resume` drives two turns on one session and asserts
 * the second turn retains context from the first — proving the harness threads
 * conversation state across turns (and that both turns record/replay).
 */
const RESUME_TIMEOUT_MS = 180_000;
const SCENARIO_TIMEOUT_MS = 120_000;

const isModelRoute = (url: URL): boolean =>
  /\/(messages|responses|chat\/completions)\b/.test(url.pathname);

/**
 * Synthetic handler for the `abort` scenario. The moment the first *model*
 * request arrives — i.e. the turn has genuinely started — it aborts the
 * controller and fails the request immediately, so the turn ends via the abort
 * deterministically (no real network, no fixture, no timing race). Telemetry
 * and metrics routes stay benign so the CLI bootstrap reaches the model call.
 */
function createAbortingHandler(controller: AbortController): HttpHandler {
  return request => {
    let modelRoute = false;
    try {
      modelRoute = isModelRoute(new URL(request.url));
    } catch {
      modelRoute = false;
    }
    if (!modelRoute) {
      return new Response(null, { status: 204 });
    }
    controller.abort();
    return new Response(null, { status: 499 });
  };
}

for (const adapter of REPLAY_ADAPTERS) {
  describe(`lifecycle: ${adapter.name}`, () => {
    it.skipIf(!shouldRunScenario(adapter.name, 'resume'))(
      'retains context across turns',
      async () => {
        await withReplayScenarioAgent(
          { adapterName: adapter.name, scenario: 'resume' },
          async ({ agent, session }) => {
            await agent.generate({
              session,
              prompt:
                'Remember this codeword: ALPHA-7. Reply with just the word ok.',
            });
            const result = await agent.generate({
              session,
              prompt: 'What was the codeword? Reply with only the codeword.',
            });
            expect(result.text.toUpperCase()).toContain('ALPHA-7');
          },
        );
      },
      RESUME_TIMEOUT_MS,
    );

    // Synthetic (no fixture): the handler aborts the turn the instant the model
    // request lands and fails it, so cancellation is deterministic with no real
    // network. Needs a sandbox but no model credential.
    it.skipIf(!shouldRunSyntheticScenario())(
      'aborting cancels the in-flight generation',
      async () => {
        const controller = new AbortController();
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'abort',
            abortSignal: controller.signal,
            syntheticHandler: createAbortingHandler(controller),
          },
          async ({ agent, session }) => {
            await expect(
              agent.generate({
                session,
                prompt:
                  'Write a very long, detailed essay about the history of computing.',
                abortSignal: controller.signal,
              }),
            ).rejects.toThrow();
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );

    it.skipIf(!shouldRunScenario(adapter.name, 'sandbox-ops'))(
      'writeTextFile and readTextFile round-trip on the sandbox',
      async () => {
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'sandbox-ops',
            captureSandbox: true,
          },
          async ({ agent, session, sandbox, sandboxWorkDir }) => {
            if (sandbox == null || sandboxWorkDir == null) {
              throw new Error('sandbox not captured');
            }
            await agent.generate({
              session,
              prompt: 'What is 1+1? Reply with just the number.',
            });

            const path = `${sandboxWorkDir}/round-trip.txt`;
            await sandbox.writeTextFile({
              path,
              content: 'hello from harness',
            });
            const content = await sandbox.readTextFile({ path });
            expect(content).toBe('hello from harness');
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );
  });
}
