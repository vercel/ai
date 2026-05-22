import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { run } from '../../lib/run';
import { createVercelHarnessSandbox } from '../../lib/harness-sandbox';

run(async () => {
  const sandbox = await createVercelHarnessSandbox();
  const agent = new HarnessAgent({
    harness: createCodex(),
    sandbox,
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt:
        'Use the shell tool to print the current date with `date` and tell me what it says.',
      experimental_activeBuiltinTools: ['bash'],
    } as never);

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') process.stdout.write(part.text);
      if (part.type === 'tool-call')
        console.log('\n[tool-call]', part.toolName);
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
