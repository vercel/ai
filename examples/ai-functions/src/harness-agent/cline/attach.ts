/*
 * Cross-process ATTACH for the Cline harness.
 *
 * `session.detach()` persists Cline's session history and makes the current
 * session handle unusable. A fresh `HarnessAgent` restores that history and
 * continues the conversation. `session.isResume` reports `true`.
 */
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import {
  createVercelNetworkSandboxSession,
  resumeVercelNetworkSandboxSession,
} from '@ai-sdk/sandbox-vercel';
import { createCline } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const harness = createCline();
  const sandboxName = `harness-${crypto.randomUUID()}`;
  const sandboxSession = await createVercelNetworkSandboxSession({
    sandboxId: sandboxName,
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });
  let activeSandboxSession = sandboxSession;
  try {
    let sessionId: string;
    let resumeState: HarnessAgentResumeSessionState;
    {
      const agent = new HarnessAgent({ harness });
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
      resumeState = await session.detach();
      console.log('[handle] resume state:');
    }

    {
      activeSandboxSession = await resumeVercelNetworkSandboxSession({
        sandboxId: sandboxName,
      });
      const agent = new HarnessAgent({ harness });
      const session = await agent.createSession({
        sandboxSession: activeSandboxSession,
        sessionId,
        resumeFrom: resumeState,
      });
      console.log('--- turn 2 ---');
      if (!session.isResume) {
        throw new Error('expected resumed session');
      }
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
