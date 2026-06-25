import { describe, expect, it } from 'vitest';
import { withReplayPersistenceAgents } from './e2e-scenario';
import { shouldRunScenario } from './e2e-shared';
import { REPLAY_ADAPTERS } from './replay-adapters';

/*
 * Tier-A persistence suite. A first session writes a marker file and runs a
 * turn; the session is detached (capturing its resume state) and a second
 * session resumes the same named sandbox. The marker must survive and the
 * second turn must work — proving stop+resume retains filesystem state across a
 * fresh session. The proxied/host sandbox is caller-owned, so `detach()` leaves
 * it (and its proxy) running for the resume to reattach.
 */
const PERSISTENCE_TIMEOUT_MS = 240_000;
const MARKER_PATH_NAME = 'persist-marker.txt';
const MARKER = 'PERSIST-OK';

for (const adapter of REPLAY_ADAPTERS) {
  describe(`persistence: ${adapter.name}`, () => {
    it.skipIf(!shouldRunScenario(adapter.name, 'persistence'))(
      'resume retains filesystem state across a fresh session',
      async () => {
        await withReplayPersistenceAgents(
          {
            adapterName: adapter.name,
            scenario: 'persistence',
            captureSandbox: true,
          },
          async ({ agent, session, sandbox, sandboxWorkDir }) => {
            if (sandbox == null || sandboxWorkDir == null) {
              throw new Error('sandbox not captured');
            }
            const result = await agent.generate({
              session,
              prompt: 'What is 2+2? Reply with just the number.',
            });
            expect(result.text).toContain('4');

            await sandbox.writeTextFile({
              path: `${sandboxWorkDir}/${MARKER_PATH_NAME}`,
              content: MARKER,
            });
          },
          async ({ agent, session, sandbox, sandboxWorkDir }) => {
            if (sandbox == null || sandboxWorkDir == null) {
              throw new Error('sandbox not captured');
            }
            const result = await agent.generate({
              session,
              prompt: 'What is 3+3? Reply with just the number.',
            });
            expect(result.text).toContain('6');

            const marker = await sandbox.readTextFile({
              path: `${sandboxWorkDir}/${MARKER_PATH_NAME}`,
            });
            expect(marker).toBe(MARKER);
          },
        );
      },
      PERSISTENCE_TIMEOUT_MS,
    );
  });
}
