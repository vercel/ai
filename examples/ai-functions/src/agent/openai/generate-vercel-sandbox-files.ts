import { Sandbox } from '@vercel/sandbox';
import { run } from '../../lib/run';
import { VercelSandboxSession } from '../../sandbox/vercel-sandbox';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const sandbox = new VercelSandboxSession(
    await Sandbox.create({
      timeout: 5 * 60 * 1000,
      runtime: 'node22',
    }),
  );

  try {
    const result = await sandboxAgent.generate({
      prompt:
        'Write a haiku about TypeScript to a file named "haiku.txt", then read it back and summarize what it says.',
      experimental_sandbox: sandbox,
    });

    console.log(result.text);
  } finally {
    await sandbox.stop();
  }
});
