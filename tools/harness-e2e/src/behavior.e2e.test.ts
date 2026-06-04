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
  });
}
