import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { run } from '../../lib/run';
import { createVercelHarnessSandbox } from '../../lib/harness-sandbox';

run(async () => {
  const sandbox = await createVercelHarnessSandbox();
  const agent = new HarnessAgent({
    harness: createCodex(),
    sandbox,
    harnessOptions: {
      codex: { reasoningEffort: 'high' },
    },
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt:
        'Plan a multi-step path from A to B where A=(0,0) and B=(3,4) on a grid, moving only N/S/E/W. ' +
        'Explain your reasoning, then give the final path.',
    });

    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-delta') {
        process.stdout.write(`[thinking] ${part.text}`);
      } else if (part.type === 'text-delta') {
        process.stdout.write(part.text);
      }
    }
    console.log();
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    await sandbox.stop();
    process.exit(exitCode);
  }
});
