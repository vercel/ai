import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { run } from '../../lib/run';
import { createVercelHarnessSandbox } from '../../lib/harness-sandbox';

run(async () => {
  const sandbox = await createVercelHarnessSandbox();
  const agent = new HarnessAgent({
    harness: createClaudeCode(),
    sandbox,
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt:
        'Look at the files in the current working directory and tell me what is there. ' +
        'Do NOT modify anything — read-only inspection only.',
      experimental_activeBuiltinTools: ['read', 'grep'],
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
