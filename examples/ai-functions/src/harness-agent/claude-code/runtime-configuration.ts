import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { run } from '../../lib/run';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: createClaudeCode({
      env: {
        AI_SDK_EXAMPLE_ENV: 'staging',
      },
    }),
    instructions:
      'Report environment values using the format `Environment: <value>`.',
    sandbox,
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt:
        'Use Bash to read AI_SDK_EXAMPLE_ENV, then report its value as instructed.',
    });
    console.log('text:', result.text);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
