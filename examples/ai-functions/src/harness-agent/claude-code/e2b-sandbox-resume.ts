/*
 * Stop-and-resume smoke test for the Claude Code harness on an E2B sandbox.
 *
 * Turn 1 runs, the harness session is stopped, and then the sandbox itself is
 * stopped, which pauses it. A fresh `HarnessAgent` then resumes the
 * conversation in the sandbox that `resumeE2BNetworkSandboxSession()` brings
 * back. If the resume works the second turn remembers the name from turn 1.
 */
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createClaudeCode } from './_create';
import {
  createE2BNetworkSandboxSession,
  resumeE2BNetworkSandboxSession,
} from '@ai-sdk/sandbox-e2b';
import { ensureE2BNodeTemplate } from '../../lib/e2b-node-template';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const claudeCode = createClaudeCode();

run(async () => {
  process.exitCode = 1;

  const sandboxSession = await createE2BNetworkSandboxSession({
    baseTemplate: await ensureE2BNodeTemplate(),
    ports: [4000],
    timeoutMs: 10 * 60 * 1000,
    template: await new HarnessAgent({
      harness: claudeCode,
    }).getSandboxTemplate(),
  });
  let activeSandboxSession = sandboxSession;
  try {
    // Turn 1: introduce the name.
    let sessionId: string;
    let resumeState: HarnessAgentResumeSessionState;
    {
      const agent = new HarnessAgent({ harness: claudeCode });
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

    // Turn 2: a new agent resumes in the sandbox that E2B brings back.
    {
      activeSandboxSession = await resumeE2BNetworkSandboxSession({
        sandboxId: sandboxSession.id,
        timeoutMs: 10 * 60 * 1000,
      });
      const agent = new HarnessAgent({ harness: claudeCode });
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
