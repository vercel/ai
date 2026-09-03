import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createCodex } from './_create';

run(async () => {
  const sandbox = await Sandbox.create({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const sandboxProvider = createVercelSandbox({ sandbox });
  const sandboxSession = await sandboxProvider.createSession();
  const portEndpoint = await sandboxSession.getPortEndpoint({
    port: 4000,
    protocol: 'ws',
  });
  const codex = createCodex({ port: 4000, portEndpoint });

  const agent = new HarnessAgent({
    harness: codex,
  });

  const session = await agent.createSession({
    sandboxSession: sandboxSession.restricted(),
  });
  try {
    const result = await agent.stream({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });

    await printFullStream({ result });

    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } finally {
    await session.destroy();
    await sandbox.stop().catch(() => {});
  }
});
