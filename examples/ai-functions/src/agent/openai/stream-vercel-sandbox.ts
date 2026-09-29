import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { run } from '../../lib/run';
import { sandboxAgent } from './sandbox-agent';
import { printFullStream } from '../../lib/print-full-stream';

run(async () => {
  const sandboxSession = await createVercelNetworkSandboxSession({
    timeout: 5 * 60 * 1000,
    runtime: 'node22',
  });

  try {
    const result = await sandboxAgent.stream({
      prompt: 'Run ls -la and tell me what you see.',
      experimental_sandbox: sandboxSession.restricted(),
    });

    await printFullStream({ result });
  } finally {
    await sandboxSession.destroy();
  }
});
