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
    const result = await agent.stream({
      session,
      prompt: 'Recite the first sentence of "A Tale of Two Cities".',
    });

    await printFullStream({ result });

    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } finally {
    await session.destroy();
  }
});
