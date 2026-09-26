import {
  HarnessAgent,
  type HarnessAgentSession,
  createHarnessSandboxTemplate,
  type HarnessAgentAdapter,
  type HarnessAgentSandboxConfig,
} from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { createClaudeCode } from './claude-code/_create';
import { createCline } from './cline/_create';
import { createCodex } from './codex/_create';
import { createDeepAgents } from './deepagents/_create';
import { createOpenCode } from './opencode/_create';
import { createPi } from './pi/_create';
import { run } from '../lib/run';

const harnesses = [
  { name: 'claude-code', harness: createClaudeCode() },
  { name: 'cline', harness: createCline() },
  { name: 'codex', harness: createCodex() },
  { name: 'deepagents', harness: createDeepAgents() },
  { name: 'opencode', harness: createOpenCode() },
  { name: 'pi', harness: createPi() },
] satisfies ReadonlyArray<{ name: string; harness: HarnessAgentAdapter }>;

const sandboxConfig = {
  workDir: 'workspace',
  bootstrapHash: 'shared-harness-tools-v1',
  onBootstrap: async ({ session, workDir, abortSignal }) => {
    await session.writeTextFile({
      path: `${workDir}/PREPARED.md`,
      content: 'This file was written before the shared sandbox snapshot.\n',
      abortSignal,
    });
  },
  onSession: async ({ session, sessionWorkDir, abortSignal }) => {
    await session.writeTextFile({
      path: `${sessionWorkDir}/SESSION.md`,
      content: 'This file was written for the current harness session.\n',
      abortSignal,
    });
  },
} satisfies HarnessAgentSandboxConfig;

run(async () => {
  const template = await createHarnessSandboxTemplate({
    harnesses: harnesses.map(({ harness }) => harness),
    sandboxConfig,
  });
  console.log('shared template identity:', template?.identity);

  for (const { name, harness } of harnesses) {
    const sandboxSession = await createVercelNetworkSandboxSession({
      runtime: 'node24',
      ports: [4000],
      template,
    });
    const agent = new HarnessAgent({ harness, sandboxConfig });
    let session: HarnessAgentSession | undefined;
    try {
      session = await agent.createSession({ sandboxSession });
      const result = await agent.generate({
        session,
        prompt: 'In one sentence, what is the capital of France?',
      });
      console.log(`[${name}]`, result.text);
    } finally {
      await session?.destroy();
      await sandboxSession.destroy();
    }
  }
});
