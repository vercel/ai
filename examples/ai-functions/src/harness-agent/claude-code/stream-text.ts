import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: createClaudeCode({ model: 'claude-sonnet-4-5' }),
    sandbox,
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
    process.exit(exitCode);
  }
});
