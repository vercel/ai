import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const pi = createPi();

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: pi,
    sandbox,
  });

  const session = await agent.createSession();
  try {
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
    await session.destroy();
  }
});
