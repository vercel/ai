import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import {
  createVercelNetworkSandboxSession,
  resumeVercelNetworkSandboxSession,
} from '@ai-sdk/sandbox-vercel';
import { createCursorACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const sandboxName = `harness-${crypto.randomUUID()}`;
  const sandboxSession = await createVercelNetworkSandboxSession({
    sandboxId: sandboxName,
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  let activeSandboxSession = sandboxSession;
  try {
    let sessionId: string;
    let resumeState: HarnessAgentResumeSessionState;
    {
      const agent = new HarnessAgent({
        harness: createCursorACP(),
      });
      const session = await agent.createSession({
        sandboxSession: activeSandboxSession,
      });
      sessionId = session.sessionId;
      const result = await agent.stream({
        session,
        prompt: 'My name is Felix. Remember it.',
      });
      await printFullStream({ result });
      resumeState = await session.stop();
    }

    activeSandboxSession = await resumeVercelNetworkSandboxSession({
      sandboxId: sandboxName,
    });
    const agent = new HarnessAgent({
      harness: createCursorACP(),
    });
    const session = await agent.createSession({
      sandboxSession: activeSandboxSession,
      sessionId,
      resumeFrom: resumeState,
    });
    try {
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
      if (!secondTurnText.includes('Felix')) {
        throw new Error(
          'Second turn did not retain context from previous turn',
        );
      }
    } finally {
      await session.destroy();
    }
  } finally {
    await activeSandboxSession.destroy();
  }
});
