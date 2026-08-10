import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: createPi({
      fileToolPathPolicy: {
        readableRoots: ['/mnt/reference'],
        writableRoots: ['/tmp'],
        deniedRoots: ['/tmp/private'],
      },
    }),
    activeTools: ['write', 'read'],
    sandbox,
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Write a short project summary to `/tmp/project-summary.txt`, then read it back and include it in your reply.',
    });

    await printFullStream({ result });
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
