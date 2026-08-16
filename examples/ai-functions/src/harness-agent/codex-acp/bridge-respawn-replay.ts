import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  assertACPRecoveryArtifactsExcludeSecrets,
  createACPHandoffSandbox,
  getACPHandoffArguments,
  readACPContinueHandoffState,
  removeACPHandoffState,
  terminateACPBridgeForRecovery,
  waitForACPCompletedRecoveryLog,
  writeACPHandoffState,
} from '../../lib/codex-acp-handoff';
import { createCodexACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const exampleName =
  'examples/ai-functions/src/harness-agent/codex-acp/bridge-respawn-replay.ts';

run(async () => {
  const { phase, statePath } = getACPHandoffArguments({
    exampleName,
    defaultStatePath: '/tmp/ai-sdk-acp-bridge-respawn-replay.json',
  });
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
        'Use the shell to run `sleep 5; printf replay-finished`, then report the exact output.',
    });
    const printing = printFullStream({ result });
    const state = await session.suspendTurn();
    await printing;
    if (sandboxSession == null) {
      throw new Error('The ACP recovery sandbox session hook did not run.');
    }
    await waitForACPCompletedRecoveryLog({
      sandboxSession,
      state,
    });
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
    await terminateACPBridgeForRecovery({
      sandboxSession,
      state,
    });
    await writeACPHandoffState({
      statePath,
      sessionId: session.sessionId,
      state,
    });
    console.log(
      `Saved a completed disconnected-host replay tail after terminating its bridge to ${statePath}.`,
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
    recovery.mode !== 'disk-replay'
  ) {
    throw new Error('Expected lifecycle recovery mode "disk-replay".');
  }
  await removeACPHandoffState({ statePath });
  console.log('Verified completed disk replay through a respawned bridge.');
  process.exit(0);
});
