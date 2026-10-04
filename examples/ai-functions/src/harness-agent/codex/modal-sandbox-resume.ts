/*
 * Stop-and-resume smoke test for the Codex harness on a Modal sandbox.
 *
 * Turn 1 runs, the harness session is stopped, and then the sandbox itself is
 * stopped, which snapshots its filesystem and terminates it. A fresh
 * `HarnessAgent` then resumes the conversation in the sandbox that
 * `resumeModalNetworkSandboxSession()` restores from that snapshot. If the
 * restore works the second turn remembers the name from turn 1.
 */
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createCodex } from './_create';
import {
  createModalNetworkSandboxSession,
  resumeModalNetworkSandboxSession,
} from '@ai-sdk/sandbox-modal';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const codex = createCodex();

const creationOptions = {
  encryptedPorts: [4000],
  timeoutMs: 10 * 60 * 1000,
};

run(async () => {
  const agentTemplate = await new HarnessAgent({
    harness: codex,
  }).getSandboxTemplate();
  const sandboxSession = await createModalNetworkSandboxSession({
    sandboxId: `harness-${crypto.randomUUID()}`,
    ...creationOptions,
    template: agentTemplate,
  });
  let activeSandboxSession = sandboxSession;
  try {
    // Turn 1: introduce the name.
    let sessionId: string;
    let resumeState: HarnessAgentResumeSessionState;
    {
      const agent = new HarnessAgent({ harness: codex });
      const session = await agent.createSession({
        sandboxSession: activeSandboxSession,
      });
      sessionId = session.sessionId;
      console.log('--- turn 1 ---');
      const result = await agent.stream({
        session,
        prompt: 'My name is Felix. Remember it.',
      });
      await printFullStream({ result });
      resumeState = await session.stop();
      console.log('[stopped] harness session');
    }

    await activeSandboxSession.stop();
    console.log('[stopped] sandbox');

    // Turn 2: a new agent resumes in the sandbox restored from the snapshot.
    {
      activeSandboxSession = await resumeModalNetworkSandboxSession({
        sandboxId: sandboxSession.id,
        ...creationOptions,
        blockNetwork: false,
      });
      const agent = new HarnessAgent({ harness: codex });
      const session = await agent.createSession({
        sandboxSession: activeSandboxSession,
        sessionId,
        resumeFrom: resumeState,
      });
      console.log('--- turn 2 (resumed) ---');
      const result = await agent.stream({
        session,
        prompt: 'What is my name? Answer in one word.',
      });
      let secondTurnText = '';
      await printFullStream({
        result,
        onText: text => {
          secondTurnText += text.text;
        },
      });
      await session.destroy();
      if (!secondTurnText.includes('Felix')) {
        throw new Error(
          'Second turn did not retain context from previous turn',
        );
      }
    }

    process.exitCode = 0;
  } finally {
    await activeSandboxSession.destroy();
  }
});
