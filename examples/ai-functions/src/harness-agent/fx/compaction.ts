import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createFx } from './_create';
import { run } from '../../lib/run';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const fx = createFx();

/*
 * ACP v1 has no portable manual compaction API. This example deliberately
 * allows the unsupported-capability error to propagate so the runtime's
 * behavior is visible to callers.
 */
run(async () => {
  const agent = new HarnessAgent({ harness: fx });
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });

  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    await agent.generate({
      session,
      prompt: 'Reply with exactly ready.',
    });
    await session.compact();
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
