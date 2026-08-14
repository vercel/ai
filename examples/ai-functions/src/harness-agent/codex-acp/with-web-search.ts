import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP({ webSearch: true }),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });

  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Search the web for the latest version of Node.js and report it back.',
    });
    await printFullStream({ result });
  } finally {
    await session.destroy();
  }
});
