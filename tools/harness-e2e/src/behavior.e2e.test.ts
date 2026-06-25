import { describe, expect, it } from 'vitest';
import { withReplayScenarioAgent } from './e2e-scenario';
import { shouldRunScenario } from './e2e-shared';
import { REPLAY_ADAPTERS } from './replay-adapters';

/*
 * Tier-A behavior suite — single-turn scenarios exercising consumer-facing
 * options. Same record/replay pipeline as the core suite. Self-skips unless the
 * fixture exists (replay) or recording is requested with credentials present.
 */
const SCENARIO_TIMEOUT_MS = 120_000;

for (const adapter of REPLAY_ADAPTERS) {
  describe(`behavior: ${adapter.name}`, () => {
    it.skipIf(!shouldRunScenario(adapter.name, 'instructions'))(
      'instructions steer the response',
      async () => {
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'instructions',
            instructions:
              'You must always respond with exactly the word PONG when the user says ping. Nothing else.',
          },
          async ({ agent, session }) => {
            const result = await agent.generate({ session, prompt: 'ping' });
            expect(result.text.toUpperCase()).toContain('PONG');
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );

    it.skipIf(!shouldRunScenario(adapter.name, 'cost'))(
      'generate() returns usage data',
      async () => {
        await withReplayScenarioAgent(
          { adapterName: adapter.name, scenario: 'cost' },
          async ({ agent, session }) => {
            const result = await agent.generate({
              session,
              prompt: 'Reply with a single word.',
            });
            expect(result.usage).toBeDefined();
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );

    // Extended thinking is a claude-code-only setting in the reimpl
    // (`thinking: 'adaptive'`; there is no `effort` field). Other adapters
    // self-skip via the adapter guard.
    it.skipIf(
      adapter.name !== 'claude-code' ||
        !shouldRunScenario(adapter.name, 'thinking'),
    )(
      'thinking does not break a normal turn',
      async () => {
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'thinking',
            harnessSettings: { thinking: 'adaptive' },
          },
          async ({ agent, session }) => {
            const result = await agent.generate({
              session,
              prompt: 'What is 2+2? Reply with just the number.',
            });
            expect(result.text).toContain('4');
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );

    it.skipIf(!shouldRunScenario(adapter.name, 'files'))(
      'agent can read a file written to the sandbox',
      async () => {
        await withReplayScenarioAgent(
          {
            adapterName: adapter.name,
            scenario: 'files',
            captureSandbox: true,
          },
          async ({ agent, session, sandbox, sandboxWorkDir }) => {
            if (sandbox == null || sandboxWorkDir == null) {
              throw new Error('sandbox not captured');
            }
            await sandbox.writeTextFile({
              path: `${sandboxWorkDir}/uploaded.txt`,
              content: 'the codeword is FALCON-9',
            });
            const result = await agent.generate({
              session,
              prompt:
                'Read the file uploaded.txt and reply with only the codeword it contains.',
            });
            expect(result.text.toUpperCase()).toContain('FALCON-9');
          },
        );
      },
      SCENARIO_TIMEOUT_MS,
    );
  });
}
