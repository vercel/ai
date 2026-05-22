import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { run } from '../../lib/run';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const handle = await createVercelSandbox({
    timeout: 5 * 60 * 1000,
    runtime: 'node22',
  }).create();

  try {
    const result = await sandboxAgent.generate({
      prompt:
        'Write a haiku about TypeScript to a file named "haiku.txt", then read it back and summarize what it says.',
      experimental_sandbox: handle.session,
    });

    console.log(result.text);
  } finally {
    await handle.stop();
  }
});
