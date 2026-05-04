import { run } from '../../lib/run';
import { VercelSandbox } from '../../sandbox/vercel-sandbox';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const sandbox = await VercelSandbox.create();

  try {
    const result = await sandboxAgent.stream({
      prompt: 'Run ls -la and tell me what you see.',
      sandbox,
    });

    for await (const textPart of result.textStream) {
      process.stdout.write(textPart);
    }
  } finally {
    await sandbox.stop();
  }
});
