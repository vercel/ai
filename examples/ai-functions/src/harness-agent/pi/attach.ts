/*
 * Cross-instance attach check for the Pi harness. Pi has no bridge process, so
 * detaching between turns persists its session state for a fresh
 * `HarnessAgent` to resume.
 */
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createPi } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const harness = createPi();
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });

  let sessionId: string;
  let resumeState: HarnessAgentResumeSessionState;
  {
    const agent = new HarnessAgent({ harness, sandbox });
    const session = await agent.createSession();
    sessionId = session.sessionId;
    console.log('--- turn 1 ---');
    const result = await agent.stream({
      session,
      prompt: 'My name is Felix. Remember it.',
    });
    await printFullStream({ result });
    resumeState = await session.detach();
    console.log('[handle] resume state:', JSON.stringify(resumeState));
  }

  {
    const agent = new HarnessAgent({ harness, sandbox });
    const session = await agent.createSession({
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
      throw new Error('Second turn did not retain context from previous turn');
    }
  }

  process.exit(0);
});
