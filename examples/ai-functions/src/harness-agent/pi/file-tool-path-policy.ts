import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createPi({
      fileToolPathPolicy: {
        readableRoots: ['/mnt/reference'],
        writableRoots: ['/tmp'],
        deniedRoots: ['/tmp/private'],
      },
    }),
    activeTools: ['write', 'read'],
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.stream({
      session,
      prompt:
        'Write a short project summary to `/tmp/project-summary.txt`, then read it back and include it in your reply.',
    });

    await printFullStream({ result });
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
