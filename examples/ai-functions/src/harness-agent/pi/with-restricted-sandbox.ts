import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const pi = createPi();

run(async () => {
  const sandbox = await Sandbox.create({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });

  const agent = new HarnessAgent({
    harness: pi,
  });

  const sandboxProvider = createVercelSandbox({ sandbox });
  const sandboxSession = await sandboxProvider.createSession();
  const session = await agent.createSession({
    sandboxSession: sandboxSession.restricted(),
  });
  try {
    const result = await agent.stream({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });

    await printFullStream({ result });

    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } finally {
    await session.destroy();
    await sandbox.stop().catch(() => {});
  }
});
