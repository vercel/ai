import { run } from '../../lib/run';
import { VercelSandbox } from '../../sandbox/vercel-sandbox';
import { sandboxAgent } from './sandbox-agent';
import { printFullStream } from '../../lib/print-full-stream';

run(async () => {
  const sandbox = await VercelSandbox.create();

  try {
    const result = await sandboxAgent.stream({
      prompt: 'Run ls -la and tell me what you see.',
      sandbox,
    });

    await printFullStream({ result });
  } finally {
    await sandbox.stop();
  }
});
