import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  createACPHandoffSandbox,
  getACPHandoffArguments,
  readACPContinueHandoffState,
  removeACPHandoffState,
  writeACPHandoffState,
} from '../../lib/codex-acp-handoff';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const exampleName =
  'examples/ai-functions/src/harness-agent/codex-acp/live-suspend.ts';

run(async () => {
  const { phase, statePath } = getACPHandoffArguments({
    exampleName,
    defaultStatePath: '/tmp/ai-sdk-acp-suspend.json',
  });
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createACPHandoffSandbox(),
  });

  if (phase === 'start') {
    const session = await agent.createSession();
    let suspended = false;
    try {
      const result = await agent.stream({
        session,
        prompt:
          'Use the shell to run `sleep 20; printf live-suspend-finished`, then report the exact output.',
      });
      const streamDone = printFullStream({ result });
      const state = await session.suspendTurn();
      suspended = true;
      await streamDone;
      await writeACPHandoffState({
        statePath,
        sessionId: session.sessionId,
        state,
      });
      console.log(`Saved exact live-turn cursor to ${statePath}.`);
      process.exit(0);
    } finally {
      if (!suspended) await session.destroy();
    }
    return;
  }

  const handoff = await readACPContinueHandoffState({ statePath });
  const session = await agent.createSession({
    sessionId: handoff.sessionId,
    continueFrom: handoff.state,
  });
  try {
    const result = await agent.continueStream({ session });
    await printFullStream({ result });
  } finally {
    await session.destroy();
  }
  await removeACPHandoffState({ statePath });
  process.exit(0);
});
