import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP(),
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
        'Solve this step by step: if f(x) = x^3 - 6x^2 + 11x - 6, find all roots and prove they are correct.',
    });
    await printFullStream({ result });
  } finally {
    await session.destroy();
  }
});
