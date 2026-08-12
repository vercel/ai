import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createDeepAgents } from './_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const deepAgents = createDeepAgents();

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: deepAgents,
    sandbox,
  });

  const session = await agent.createSession();
  try {
    console.log('--- turn 1 ---');
    const first = await agent.stream({
      session,
      prompt: 'My name is Ada. Remember it.',
    });
    await printFullStream({ result: first });

    console.log('\n--- turn 2 ---');
    const second = await agent.stream({
      session,
      prompt: 'What is my name? Answer in one word.',
    });
    await printFullStream({ result: second });
  } finally {
    await session.destroy();
  }
});
