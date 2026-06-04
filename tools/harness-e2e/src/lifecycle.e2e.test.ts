import { describe, expect, it } from 'vitest';
import { withReplayScenarioAgent } from './e2e-scenario';
import { shouldRunScenario } from './e2e-shared';
import { REPLAY_ADAPTERS } from './replay-adapters';

/*
 * Tier-A lifecycle suite. `resume` drives two turns on one session and asserts
 * the second turn retains context from the first — proving the harness threads
 * conversation state across turns (and that both turns record/replay).
 */
const RESUME_TIMEOUT_MS = 180_000;

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
  });
}
