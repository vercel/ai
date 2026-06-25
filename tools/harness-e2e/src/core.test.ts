import type { HarnessV1SandboxProvider } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { REPLAY_ADAPTERS } from './replay-adapters';
import { addTool } from './tools';

/*
 * No-HTTP core test — `agent.tools` merges the harness builtins with the
 * user-defined tools, with user tools overriding builtins on key collision.
 * Pure construction (no session and no credentials), so it runs in the default
 * `pnpm test` rather than the sandbox-booting integration suite.
 *
 * Parity note: the original `e2e-core` also asserts auto/user `sessionId` and
 * `workDir`. Those do not port to this reimpl — `sessionId` lives on the
 * session (which requires booting a sandbox) and the working directory is only
 * reachable through the `@internal` `getSessionWorkDir()`. Tracked as a §23
 * parity caveat in KEY_REQUIREMENTS_AND_GAPS.md, not forced into a test here.
 */
const DUMMY_CREDENTIAL = { apiKey: 'unit-test-key' } as const;
const sandbox: HarnessV1SandboxProvider = {
  specificationVersion: 'harness-sandbox-v1',
  providerId: 'unit-test-sandbox',
  create: async () => {
    throw new Error('not used');
  },
};

for (const adapter of REPLAY_ADAPTERS) {
  describe(`tools listing: ${adapter.name}`, () => {
    it('merges harness builtins with user-defined tools', () => {
      const harness = adapter.createHarness(DUMMY_CREDENTIAL);
      const agent = new HarnessAgent({
        harness,
        sandbox,
        tools: { add: addTool() },
      });

      const toolNames = Object.keys(agent.tools);
      expect(toolNames).toContain('add');
      for (const builtin of Object.keys(harness.builtinTools)) {
        expect(toolNames).toContain(builtin);
      }
      expect(toolNames.length).toBeGreaterThan(
        Object.keys(harness.builtinTools).length,
      );
    });

    it('lets a user tool override a builtin on key collision', () => {
      const harness = adapter.createHarness(DUMMY_CREDENTIAL);
      const builtinName = Object.keys(harness.builtinTools)[0];
      if (builtinName == null) return;

      const override = tool({
        description: 'overrides a builtin',
        inputSchema: addTool().inputSchema,
        execute: async () => ({ overridden: true }),
      });
      const agent = new HarnessAgent({
        harness,
        sandbox,
        tools: { [builtinName]: override },
      });

      expect(agent.tools[builtinName]).toBe(override);
    });
  });
}
