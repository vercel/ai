import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  let observedCompletedSteps = 0;
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    stopWhen: ({ steps }) => {
      observedCompletedSteps = steps.length;
      console.log('stopWhen observed steps:', observedCompletedSteps);
      return false;
    },
  });
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Run `printf inferred-step` in the shell, then explain the exact output in one sentence.',
    });
    await printFullStream({ result });
    if (observedCompletedSteps === 0) {
      throw new Error('Expected stopWhen to observe an inferred tool step.');
    }
  } finally {
    await session.destroy();
  }
});
