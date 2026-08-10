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
        'In one tool phase, start two separate shell calls in parallel: one must run `sleep 1; printf first`, and the other must run `sleep 1; printf second`. Then report both exact outputs.',
    });
    await printFullStream({ result });
    console.log('steps:', (await result.steps).length);
  } finally {
    await session.destroy();
  }
});
