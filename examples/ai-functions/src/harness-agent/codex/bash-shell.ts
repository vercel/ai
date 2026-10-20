import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createCodex } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const codex = createCodex();

run(async () => {
  const agent = new HarnessAgent({
    harness: codex,
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.stream({
      session,
      prompt: 'Run `uname -a` and tell me what kernel this sandbox is running.',
    });
    await printFullStream({ result });
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
