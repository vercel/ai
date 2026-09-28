import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { run } from '../../lib/run';
import { createPi } from './_create';

run(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;

  const agent = new HarnessAgent({
    harness: createPi({ auth: 'anthropic' }),
    model: 'anthropic/claude-haiku-4-5',
  });
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
    console.log(result.text);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
