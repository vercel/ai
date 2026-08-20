import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  createACPHandoffSandbox,
  getACPHandoffArguments,
  readACPResumeHandoffState,
  removeACPHandoffState,
  writeACPHandoffState,
} from '../../lib/codex-acp-handoff';
import { createCodexACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const exampleName =
  'examples/ai-functions/src/harness-agent/codex-acp/live-attach.ts';

run(async () => {
  const { phase, statePath } = getACPHandoffArguments({
    exampleName,
    defaultStatePath: '/tmp/ai-sdk-acp-attach.json',
  });
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createACPHandoffSandbox(),
  });

  if (phase === 'start') {
    const session = await agent.createSession();
    let detached = false;
    try {
      const result = await agent.stream({
        session,
        prompt:
          'Remember that the handoff codename is AMBER-KITE. Reply only with "remembered".',
      });
      await printFullStream({ result });
      const state = await session.detach();
      detached = true;
      await writeACPHandoffState({
        statePath,
        sessionId: session.sessionId,
        state,
      });
      console.log(`Saved live attach state to ${statePath}.`);
      process.exit(0);
    } finally {
      if (!detached) await session.destroy();
    }
    return;
  }

  const handoff = await readACPResumeHandoffState({ statePath });
  const session = await agent.createSession({
    sessionId: handoff.sessionId,
    resumeFrom: handoff.state,
  });
  try {
    if (!session.isResume) {
      throw new Error('Expected a live resumed ACP session.');
    }
    const result = await agent.stream({
      session,
      prompt: 'What is the handoff codename? Reply with only the codename.',
    });
    await printFullStream({ result });
  } finally {
    await session.destroy();
  }
  await removeACPHandoffState({ statePath });
  process.exit(0);
});
