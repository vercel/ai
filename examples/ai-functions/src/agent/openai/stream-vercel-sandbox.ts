import { Sandbox } from '@vercel/sandbox';
import { run } from '../../lib/run';
import { VercelSandbox } from '../../sandbox/vercel-sandbox';
import { sandboxAgent } from './sandbox-agent';
import { printFullStream } from '../../lib/print-full-stream';

run(async () => {
  const sandbox = new VercelSandbox(
    await Sandbox.create({
      timeout: 5 * 60 * 1000,
      runtime: 'node22',
    }),
  );

  try {
    const result = await sandboxAgent.stream({
      prompt: 'Run ls -la and tell me what you see.',
      experimental_sandbox: sandbox,
    });

    await printFullStream({ result });
  } finally {
    await sandbox.stop();
  }
});
