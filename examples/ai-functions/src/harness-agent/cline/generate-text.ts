import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createCline } from './_create';
import { run } from '../../lib/run';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const cline = createCline();

run(async () => {
  const agent = new HarnessAgent({
    harness: cline,
  });

  let exitCode = 0;
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log('text:', result.text);
    console.log('finishReason:', result.finishReason);
    console.log('usage:', result.usage);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
    process.exit(exitCode);
  }
});
