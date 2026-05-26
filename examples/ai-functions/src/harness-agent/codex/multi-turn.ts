import { HarnessAgent } from '@ai-sdk/harness/agent';
import { codex } from '@ai-sdk/harness-codex';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: codex,
    sandbox,
  });

  let exitCode = 0;
  try {
    console.log('--- turn 1 ---');
    const first = await agent.stream({
      prompt: 'My name is Felix. Remember it.',
    });
    await printFullStream({ result: first });

    console.log('--- turn 2 ---');
    const second = await agent.stream({
      prompt: 'What is my name? Answer in one word.',
    });
    await printFullStream({ result: second });
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    process.exit(exitCode);
  }
});
