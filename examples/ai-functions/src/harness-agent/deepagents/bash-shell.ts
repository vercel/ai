import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createDeepAgents } from './_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const deepAgents = createDeepAgents();

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({ harness: deepAgents, sandbox });

  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'Run `uname -a` and tell me what kernel this sandbox is running.',
    });
    await printFullStream({ result });
  } finally {
    await session.destroy();
  }
});
