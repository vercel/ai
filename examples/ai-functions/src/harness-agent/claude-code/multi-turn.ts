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
    harness: createClaudeCode(),
    sandbox,
  });

  let exitCode = 0;
  try {
    console.log('--- turn 1 ---');
    const first = await agent.generate({
      prompt: 'My name is Felix. Remember it.',
    });
    console.log(first.text);

    console.log('--- turn 2 ---');
    const second = await agent.generate({
      prompt: 'What is my name? Answer in one word.',
    });
    console.log(second.text);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    process.exit(exitCode);
  }
});
