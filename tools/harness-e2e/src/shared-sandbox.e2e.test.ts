import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withReplaySharedSandbox } from './e2e-scenario';
import { shouldRunScenario } from './e2e-shared';

/*
 * Tier-A shared-sandbox suite (claude-code only). Multiple agents run on ONE
 * caller-owned, proxied sandbox via a bridge-port pool — each session leases a
 * distinct bridge port, all route their LLM HTTP through the single shared
 * proxy/fixture. Asserts the sandbox is shared (filesystem visible across
 * agents) and stays alive across sessions.
 */
const ADAPTER = 'claude-code';
const SEQUENTIAL_TIMEOUT_MS = 240_000;
const CONCURRENT_TIMEOUT_MS = 300_000;

describe(`shared-sandbox: ${ADAPTER}`, () => {
  it.skipIf(!shouldRunScenario(ADAPTER, 'shared-sandbox-sequential'))(
    'runs two agents in sequence on one sandbox with shared filesystem',
    async () => {
      await withReplaySharedSandbox(
        { adapterName: ADAPTER, scenario: 'shared-sandbox-sequential' },
        async ({ makeAgent, getSandbox, getSandboxWorkDir }) => {
          const agentA = makeAgent();
          const sessionA = await agentA.createSession({
            sessionId: 'shared-seq-a',
          });
          const sharedPath = (() => {
            const workDir = getSandboxWorkDir();
            if (workDir == null) throw new Error('sandbox not captured');
            return `${dirname(workDir)}/shared.txt`;
          })();
          try {
            const r1 = await agentA.generate({
              session: sessionA,
              prompt: 'What is 2+2? Reply with just the number.',
            });
            expect(r1.text).toContain('4');
            const sandbox = getSandbox();
            if (sandbox == null) throw new Error('sandbox not captured');
            await sandbox.writeTextFile({
              path: sharedPath,
              content: 'from-agent-a',
            });
          } finally {
            await sessionA.destroy().catch(() => {});
          }

          const agentB = makeAgent();
          const sessionB = await agentB.createSession({
            sessionId: 'shared-seq-b',
          });
          try {
            const r2 = await agentB.generate({
              session: sessionB,
              prompt: 'What is 3+3? Reply with just the number.',
            });
            expect(r2.text).toContain('6');
            const sandbox = getSandbox();
            if (sandbox == null) throw new Error('sandbox not captured');
            const shared = await sandbox.readTextFile({ path: sharedPath });
            expect(shared).toBe('from-agent-a');
          } finally {
            await sessionB.destroy().catch(() => {});
          }
        },
      );
    },
    SEQUENTIAL_TIMEOUT_MS,
  );

  it.skipIf(!shouldRunScenario(ADAPTER, 'shared-sandbox-concurrent'))(
    'runs two agents concurrently on one sandbox via the bridge-port pool',
    async () => {
      await withReplaySharedSandbox(
        { adapterName: ADAPTER, scenario: 'shared-sandbox-concurrent' },
        async ({ makeAgent }) => {
          const agentA = makeAgent();
          const agentB = makeAgent();
          const sessionA = await agentA.createSession({
            sessionId: 'shared-conc-a',
          });
          const sessionB = await agentB.createSession({
            sessionId: 'shared-conc-b',
          });
          try {
            const [rA, rB] = await Promise.all([
              agentA.generate({
                session: sessionA,
                prompt: 'What is 2+2? Reply with just the number.',
              }),
              agentB.generate({
                session: sessionB,
                prompt: 'What is 3+3? Reply with just the number.',
              }),
            ]);
            expect(rA.text).toContain('4');
            expect(rB.text).toContain('6');
          } finally {
            await Promise.all([
              sessionA.destroy().catch(() => {}),
              sessionB.destroy().catch(() => {}),
            ]);
          }
        },
      );
    },
    CONCURRENT_TIMEOUT_MS,
  );
});
