import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { run } from '../../lib/run';
import { createVercelHarnessSandbox } from '../../lib/harness-sandbox';

run(async () => {
  const sandbox = await createVercelHarnessSandbox();
  const agent = new HarnessAgent({
    harness: claudeCode(),
    sandbox,
    harnessOptions: {
      'claude-code': { model: 'claude-sonnet-4-5' },
    },
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt: 'Recite the first sentence of "A Tale of Two Cities".',
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') process.stdout.write(part.text);
    }
    console.log();

    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    await sandbox.stop();
    process.exit(exitCode);
  }
});
