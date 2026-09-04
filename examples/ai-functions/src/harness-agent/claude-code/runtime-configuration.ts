import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from './_create';
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

  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt:
        'Use Bash to read AI_SDK_EXAMPLE_ENV, then report its value as instructed.',
    });
    console.log('text:', result.text);
  } finally {
    await session.destroy();
  }
});
