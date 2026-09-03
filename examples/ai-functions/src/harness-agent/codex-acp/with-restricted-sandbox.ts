import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';
import { createCodexACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

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
  const agent = new HarnessAgent({
    harness: createCodexACP({ port: 4000, portEndpoint }),
  });

  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession({
      sandboxSession: sandboxSession.restricted(),
    });
    const result = await agent.stream({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    await printFullStream({ result });
  } finally {
    await session?.destroy();
    await sandbox.stop();
  }
});
