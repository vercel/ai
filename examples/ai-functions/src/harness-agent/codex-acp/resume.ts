import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });

  let sessionId: string;
  let resumeState: HarnessAgentResumeSessionState;
  {
    const agent = new HarnessAgent({
      harness: createCodexACP(),
      sandbox,
    });
    const session = await agent.createSession();
    sessionId = session.sessionId;
    const result = await agent.stream({
      session,
      prompt: 'My name is Felix. Remember it.',
    });
    await printFullStream({ result });
    resumeState = await session.stop();
  }

  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox,
  });
  const session = await agent.createSession({
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
      throw new Error('Second turn did not retain context from previous turn');
    }
  } finally {
    await session.destroy();
  }
});
