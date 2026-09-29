import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import {
  createVercelNetworkSandboxSessionFromNativeSandbox,
  createVercelSandboxSessionFromNativeSandbox,
} from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const pi = createPi();

run(async () => {
  const sandbox = await Sandbox.create({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });

  const agent = new HarnessAgent({
    harness: pi,
  });

  const sandboxSession =
    createVercelNetworkSandboxSessionFromNativeSandbox(sandbox);
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({
      sandboxSession: createVercelSandboxSessionFromNativeSandbox(sandbox),
    });
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
