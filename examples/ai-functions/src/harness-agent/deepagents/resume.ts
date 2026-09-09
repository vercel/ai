/*
 * Cross-process resume check for the Deep Agents harness. A fresh
 * `HarnessAgent` resumes from the state produced by `session.stop()` and must
 * retain the conversation from before the sandbox snapshot.
 */
import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createDeepAgents } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const deepAgents = createDeepAgents();

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });

  let sessionId: string;
  let resumeState: HarnessAgentResumeSessionState;
  {
    const agent = new HarnessAgent({ harness: deepAgents, sandbox });
    const session = await agent.createSession();
    sessionId = session.sessionId;
    console.log('--- turn 1 ---');
    const result = await agent.stream({
      session,
      prompt: 'My name is Felix. Remember it.',
    });
    await printFullStream({ result });
    resumeState = await session.stop();
    console.log('[stopped] resume state:', JSON.stringify(resumeState));
  }

  {
    const agent = new HarnessAgent({ harness: deepAgents, sandbox });
    const session = await agent.createSession({
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
      throw new Error('Second turn did not retain context from previous turn');
    }
  }

  process.exit(0);
});
