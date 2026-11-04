import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSessionFromNativeSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createDeepAgents } from './_create';

const deepAgents = createDeepAgents();

run(async () => {
  const sandbox = await Sandbox.create({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const sandboxSession =
    createVercelNetworkSandboxSessionFromNativeSandbox(sandbox);

  const agent = new HarnessAgent({
    harness: deepAgents,
  });

  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.stream({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });

    await printFullStream({ result });

    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
