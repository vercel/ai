import {
  HarnessAgent,
  type HarnessAgentResumeSessionState,
} from '@ai-sdk/harness/agent';
import { createDeepAgents } from './_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { mintBridgeToken } from '../../lib/mint-bridge-token';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

// Cross-process ATTACH: detach parks the live bridge + sandbox and returns
// coordinates; a fresh HarnessAgent reattaches and continues mid-conversation
// (the in-memory conversation survives because the bridge stays alive).
run(async () => {
  const harness = createDeepAgents({ mintBridgeToken });
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
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
    console.log('[handle] live coords:', JSON.stringify(resumeState));
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
