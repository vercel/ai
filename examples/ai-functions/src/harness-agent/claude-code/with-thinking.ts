import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { run } from '../../lib/run';
import { createVercelHarnessSandbox } from '../../lib/harness-sandbox';

run(async () => {
  const sandbox = await createVercelHarnessSandbox();
  const agent = new HarnessAgent({
    harness: createClaudeCode(),
    sandbox,
    harnessOptions: {
      'claude-code': { thinking: 'adaptive' },
    },
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt:
        'Plan how to convert miles to kilometres, then give the answer for 26.2 miles. ' +
        'Show your reasoning briefly.',
    });

    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-delta') {
        process.stdout.write(`[thinking] ${part.text}`);
      } else if (part.type === 'text-delta') {
        process.stdout.write(part.text);
      }
    }
    console.log();

    const reasoning = await result.reasoningText;
    console.log('reasoning text length:', reasoning?.length ?? 0);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    await sandbox.stop();
    process.exit(exitCode);
  }
});
