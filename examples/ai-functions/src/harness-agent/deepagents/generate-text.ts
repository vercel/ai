import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createDeepAgents } from './_create';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { run } from '../../lib/run';

const deepAgents = createDeepAgents();

run(async () => {
  const agent = new HarnessAgent({
    harness: deepAgents,
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
    const result = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log('text:', result.text);
    console.log('finishReason:', result.finishReason);
    console.log('usage:', result.usage);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
