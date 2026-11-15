import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createCursor } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const cursor = createCursor();

run(async () => {
  const agent = new HarnessAgent({
    harness: cursor,
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    console.log('--- turn 1 ---');
    const first = await agent.stream({
      session,
      prompt: 'My name is Felix. Remember it.',
    });
    await printFullStream({ result: first });

    console.log('--- turn 2 ---');
    const second = await agent.stream({
      session,
      prompt: 'What is my name? Answer in one word.',
    });
    let secondTurnText = '';
    await printFullStream({
      result: second,
      onText: text => {
        secondTurnText += text.text;
      },
    });
    if (!secondTurnText.includes('Felix')) {
      throw new Error('Second turn did not retain context from previous turn');
    }
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
