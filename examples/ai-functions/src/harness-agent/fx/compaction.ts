import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createFx } from './_create';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const fx = createFx();

/*
 * ACP v1 has no portable manual compaction API. This example deliberately
 * allows the unsupported-capability error to propagate so the runtime's
 * behavior is visible to callers.
 */
run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({ harness: fx, sandbox });

  const session = await agent.createSession();
  try {
    await agent.generate({
      session,
      prompt: 'Reply with exactly ready.',
    });
    await session.compact();
  } finally {
    await session.destroy();
  }
});
