import { describe, expect, it } from 'vitest';
import {
  withReplayPersistenceAgents,
  withReplayScenarioAgent,
} from './e2e-scenario';
import { type GatewayCredential, shouldRunScenario } from './e2e-shared';
import { addTool } from './tools';

/*
 * Pi-only host suite. Pi runs the model on the host (split-runtime: the sandbox
 * is filesystem/shell only), so these exercise the host-fetch interception path
 * and Pi-specific surfaces — custom host tools, the `auth.customEnv` resolution,
 * and conversation-state restore across a fresh adapter instance.
 *
 * `host-approval` is intentionally absent — it depends on approvals (§13,
 * Tier-B).
 */
const ADAPTER = 'pi';
const SCENARIO_TIMEOUT_MS = 120_000;
const PERSISTENCE_TIMEOUT_MS = 240_000;
const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';

describe(`pi-host: ${ADAPTER}`, () => {
  it.skipIf(!shouldRunScenario(ADAPTER, 'host-lifecycle'))(
    'runs a turn and does sandbox file I/O through the host runtime',
    async () => {
      await withReplayScenarioAgent(
        {
          adapterName: ADAPTER,
          scenario: 'host-lifecycle',
          captureSandbox: true,
        },
        async ({ agent, session, sandbox, sandboxWorkDir }) => {
          if (sandbox == null || sandboxWorkDir == null) {
            throw new Error('sandbox not captured');
          }
          const basic = await agent.generate({
            session,
            prompt: 'What is 2+2? Reply with just the number.',
          });
          expect(basic.text).toContain('4');

          const path = `${sandboxWorkDir}/notes.txt`;
          await sandbox.writeTextFile({ path, content: 'TOKEN=SUNRISE-42' });
          const content = await sandbox.readTextFile({ path });
          expect(content).toContain('SUNRISE-42');
        },
      );
    },
    SCENARIO_TIMEOUT_MS,
  );

  it.skipIf(!shouldRunScenario(ADAPTER, 'host-custom-tool'))(
    'executes a host custom tool',
    async () => {
      await withReplayScenarioAgent(
        {
          adapterName: ADAPTER,
          scenario: 'host-custom-tool',
          tools: { add: addTool() },
        },
        async ({ agent, session }) => {
          const result = await agent.generate({
            session,
            prompt:
              'Use the add tool to compute 21 + 21, then reply with only the resulting number.',
          });
          const toolCalls = await result.toolCalls;
          expect(toolCalls.map(call => call.toolName)).toContain('add');
          expect(result.text).toContain('42');
        },
      );
    },
    SCENARIO_TIMEOUT_MS,
  );

  it.skipIf(!shouldRunScenario(ADAPTER, 'host-custom-env'))(
    'authenticates via auth.customEnv on the host',
    async () => {
      await withReplayScenarioAgent(
        {
          adapterName: ADAPTER,
          scenario: 'host-custom-env',
          harnessSettings: (credential: GatewayCredential) => ({
            auth: {
              customEnv: {
                AI_GATEWAY_API_KEY:
                  credential.apiKey ?? credential.oidcToken ?? '',
                AI_GATEWAY_BASE_URL: GATEWAY_BASE_URL,
              },
            },
          }),
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

  it.skipIf(!shouldRunScenario(ADAPTER, 'host-persistence'))(
    'resume retains filesystem state across a fresh session',
    async () => {
      await withReplayPersistenceAgents(
        {
          adapterName: ADAPTER,
          scenario: 'host-persistence',
          captureSandbox: true,
        },
        async ({ agent, session, sandbox, sandboxWorkDir }) => {
          if (sandbox == null || sandboxWorkDir == null) {
            throw new Error('sandbox not captured');
          }
          const r1 = await agent.generate({
            session,
            prompt: 'What is 2+2? Reply with just the number.',
          });
          expect(r1.text).toContain('4');
          await sandbox.writeTextFile({
            path: `${sandboxWorkDir}/persist-marker.txt`,
            content: 'PERSIST-OK',
          });
        },
        async ({ agent, session, sandbox, sandboxWorkDir }) => {
          if (sandbox == null || sandboxWorkDir == null) {
            throw new Error('sandbox not captured');
          }
          const r2 = await agent.generate({
            session,
            prompt: 'What is 3+3? Reply with just the number.',
          });
          expect(r2.text).toContain('6');
          const marker = await sandbox.readTextFile({
            path: `${sandboxWorkDir}/persist-marker.txt`,
          });
          expect(marker).toBe('PERSIST-OK');
        },
      );
    },
    PERSISTENCE_TIMEOUT_MS,
  );

  it.skipIf(!shouldRunScenario(ADAPTER, 'host-workflow-resume'))(
    'restores conversation state on a resumed session',
    async () => {
      await withReplayPersistenceAgents(
        { adapterName: ADAPTER, scenario: 'host-workflow-resume' },
        async ({ agent, session }) => {
          const r1 = await agent.generate({
            session,
            prompt:
              'Remember this: the secret code is ORBIT-22. Just confirm you got it.',
          });
          expect(r1.text).toBeTruthy();
        },
        async ({ agent, session }) => {
          const r2 = await agent.generate({
            session,
            prompt: 'What was the secret code? Reply with only the code.',
          });
          expect(r2.text.toUpperCase()).toContain('ORBIT-22');
        },
      );
    },
    PERSISTENCE_TIMEOUT_MS,
  );
});
