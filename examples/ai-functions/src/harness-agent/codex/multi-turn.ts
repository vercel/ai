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
    await sandbox.stop();
    process.exit(exitCode);
  }
});
