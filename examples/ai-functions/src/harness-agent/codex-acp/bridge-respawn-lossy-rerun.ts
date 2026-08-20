import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  assertACPRecoveryArtifactsExcludeSecrets,
  createACPHandoffSandbox,
  getACPHandoffArguments,
  readACPContinueHandoffState,
  removeACPHandoffState,
  terminateACPBridgeForRecovery,
  writeACPHandoffState,
} from '../../lib/codex-acp-handoff';
import { createCodexACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const exampleName =
  'examples/ai-functions/src/harness-agent/codex-acp/bridge-respawn-lossy-rerun.ts';

run(async () => {
  const { phase, statePath } = getACPHandoffArguments({
    exampleName,
    defaultStatePath: '/tmp/ai-sdk-acp-bridge-respawn-rerun.json',
  });
  if (
    process.env.AI_GATEWAY_API_KEY == null &&
    process.env.VERCEL_OIDC_TOKEN == null
  ) {
    throw new Error(
      'This process-loss rerun example requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN in each phase.',
    );
  }
  let sandboxSession: Experimental_SandboxSession | undefined;
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createACPHandoffSandbox(),
    sandboxConfig: {
      onSession: async ({ session }) => {
        sandboxSession = session;
      },
    },
  });

  if (phase === 'start') {
    const session = await agent.createSession();
    const warmup = await agent.generate({
      session,
      prompt: 'Reply with exactly recovery-ready and nothing else.',
    });
    if (!warmup.text.includes('recovery-ready')) {
      throw new Error(`Unexpected ACP recovery warm-up: ${warmup.text}`);
    }
    const result = await agent.stream({
      session,
      prompt:
        'Without using tools, reason carefully about whether there are infinitely many prime numbers, then reply with exactly rerun-finished and nothing else.',
    });
    const printing = printFullStream({ result });
    const state = await session.suspendTurn();
    if (sandboxSession == null) {
      throw new Error('The ACP recovery sandbox session hook did not run.');
    }
    await terminateACPBridgeForRecovery({
      sandboxSession,
      state,
    });
    await printing;
    await assertACPRecoveryArtifactsExcludeSecrets({
      sandboxSession,
      state,
      secrets: [
        process.env.CODEX_API_KEY,
        process.env.OPENAI_API_KEY,
        process.env.AI_GATEWAY_API_KEY,
        process.env.VERCEL_OIDC_TOKEN,
      ],
    });
    await writeACPHandoffState({
      statePath,
      sessionId: session.sessionId,
      state,
    });
    console.log(
      `Saved an incomplete turn after terminating its ACP bridge and process to ${statePath}.`,
    );
    console.log(
      'Run the resume phase with the current Gateway environment; credentials were not persisted.',
    );
    process.exit(0);
  }

  const saved = await readACPContinueHandoffState({ statePath });
  const session = await agent.createSession({
    sessionId: saved.sessionId,
    continueFrom: saved.state,
  });
  const result = await agent.continueStream({ session });
  await printFullStream({ result });
  const stopped = await session.stop();
  const recovery =
    stopped.data != null &&
    typeof stopped.data === 'object' &&
    !Array.isArray(stopped.data)
      ? stopped.data.recovery
      : undefined;
  if (
    recovery == null ||
    typeof recovery !== 'object' ||
    Array.isArray(recovery) ||
    recovery.mode !== 'lossy-rerun'
  ) {
    throw new Error('Expected lifecycle recovery mode "lossy-rerun".');
  }
  await removeACPHandoffState({ statePath });
  console.log(
    'Verified explicit lossy rerun against the resumed ACP session with freshly resolved Gateway credentials.',
  );
  process.exit(0);
});
