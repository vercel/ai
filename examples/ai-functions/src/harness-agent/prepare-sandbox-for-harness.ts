import {
  HarnessAgent,
  prepareSandboxForHarness,
  type HarnessAgentAdapter,
  type HarnessAgentSandboxConfig,
} from '@ai-sdk/harness/agent';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { createClaudeCode } from './claude-code/_create';
import { createCline } from './cline/_create';
import { createCodex } from './codex/_create';
import { createDeepAgents } from './deepagents/_create';
import { createOpenCode } from './opencode/_create';
import { createPi } from './pi/_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { posix } from 'node:path';
import { run } from '../lib/run';

const pi = createPi();

const openCode = createOpenCode();

const deepAgents = createDeepAgents();

const codex = createCodex();

const claudeCode = createClaudeCode();

const cline = createCline();

const sandboxTimeout = 10 * 60 * 1000;
const bridgePort = 4000;

const harnesses = [
  { name: 'claude-code', harness: claudeCode },
  { name: 'cline', harness: cline },
  { name: 'codex', harness: codex },
  { name: 'deepagents', harness: deepAgents },
  { name: 'opencode', harness: openCode },
  { name: 'pi', harness: pi },
] satisfies ReadonlyArray<{
  name: string;
  harness: HarnessAgentAdapter;
}>;

const sandboxConfig = {
  workDir: 'workspace',
  bootstrapHash: 'prepare-sandbox-for-harness-example-v1',
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
  const preparedSandbox = await Sandbox.create({
    runtime: 'node24',
    ports: [bridgePort],
    timeout: sandboxTimeout,
  });

  const snapshotId = await createPreparedSnapshot(preparedSandbox);
  console.log('prepared snapshot:', snapshotId);

  for (const { name, harness } of harnesses) {
    await runHarnessFromSnapshot({ name, harness, snapshotId });
  }
});

async function createPreparedSnapshot(
  preparedSandbox: Awaited<ReturnType<typeof Sandbox.create>>,
): Promise<string> {
  try {
    const provider = createVercelSandbox({ sandbox: preparedSandbox });
    const session = await provider.createSession();
    const result = await prepareSandboxForHarness({
      session: session.restricted(),
      harnesses: harnesses.map(({ harness }) => harness),
      sandboxConfig,
    });

    console.log('prepared identity:', result.identity);
    console.log('recipe identities:', result.recipeIdentities);
    console.log('skipped harnesses:', result.skippedHarnessIds);

    await assertBootstrapAssets({ session, harnesses });

    const stopResult = await preparedSandbox.stop();
    const snapshotId = stopResult.snapshot?.id;
    if (snapshotId == null) {
      throw new Error('Prepared sandbox stopped without creating a snapshot.');
    }
    return snapshotId;
  } catch (error) {
    await preparedSandbox.stop().catch(() => {});
    throw error;
  }
}

async function runHarnessFromSnapshot({
  name,
  harness,
  snapshotId,
}: {
  readonly name: string;
  readonly harness: HarnessAgentAdapter;
  readonly snapshotId: string;
}): Promise<void> {
  const sandbox = await Sandbox.create({
    source: { type: 'snapshot', snapshotId },
    ports: [bridgePort],
    timeout: sandboxTimeout,
  });
  const provider = createVercelSandbox({ sandbox });
  const restoredSession = await provider.createSession();
  await assertBootstrapAssets({
    session: restoredSession,
    harnesses: [{ name, harness }],
  }).catch(async error => {
    await sandbox.stop().catch(() => {});
    throw error;
  });
  const agent = new HarnessAgent({
    harness,
    sandbox: provider,
    sandboxConfig,
  });
  const session = await agent.createSession().catch(async error => {
    await sandbox.stop().catch(() => {});
    throw error;
  });

  try {
    const result = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log(`[${name}]`, result.text);
  } finally {
    await session.destroy().catch(() => {});
    await sandbox.stop().catch(() => {});
  }
}

async function assertBootstrapAssets({
  session,
  harnesses,
}: {
  readonly session: HarnessV1NetworkSandboxSession;
  readonly harnesses: ReadonlyArray<{
    name: string;
    harness: HarnessAgentAdapter;
  }>;
}): Promise<void> {
  for (const { name, harness } of harnesses) {
    const recipe = await harness.getBootstrap?.();
    if (recipe == null) {
      continue;
    }

    for (const file of recipe.files) {
      const filePath = posix.isAbsolute(file.path)
        ? file.path
        : posix.resolve(session.defaultWorkingDirectory, file.path);
      if ((await session.readTextFile({ path: filePath })) != null) {
        continue;
      }

      throw new Error(`Missing ${name} bootstrap asset: ${filePath}`);
    }
  }
}
