import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from './_create';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });

  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession();
    await agent.generate({
      session,
      prompt: 'Reply with exactly ready.',
    });
    await session.compact();
  } finally {
    await session?.destroy();
  }
});
