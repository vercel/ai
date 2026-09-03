import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCline } from './_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const cline = createCline();

run(async () => {
  const sandbox = await Sandbox.create({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });

  const agent = new HarnessAgent({
    harness: cline,
  });

  const sandboxProvider = createVercelSandbox({ sandbox });
  const sandboxSession = await sandboxProvider.createSession();

  let exitCode = 0;
  const session = await agent.createSession({ sandboxSession });
  try {
    const result = await agent.stream({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });

    await printFullStream({ result });

    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    await sandbox.stop().catch(() => {});
    process.exit(exitCode);
  }
});
