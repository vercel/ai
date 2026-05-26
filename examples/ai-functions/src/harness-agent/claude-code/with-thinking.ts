import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: createClaudeCode({ thinking: 'adaptive' }),
    sandbox,
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt:
        'Plan how to convert miles to kilometres, then give the answer for 26.2 miles. ' +
        'Show your reasoning briefly.',
    });

    await printFullStream({ result });

    const reasoning = await result.reasoningText;
    console.log('reasoning text length:', reasoning?.length ?? 0);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    process.exit(exitCode);
  }
});
