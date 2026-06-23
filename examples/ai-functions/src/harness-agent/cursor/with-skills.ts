import { HarnessAgent } from '@ai-sdk/harness/agent';
import { cursor } from '@ai-sdk/harness-cursor';
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
    harness: cursor,
    sandbox,
    skills: [
      {
        name: 'concise-answers',
        description: 'Keep answers short.',
        content: 'Answer in at most two sentences unless asked for detail.',
      },
    ],
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'List three benefits of unit tests.',
    });

    await printFullStream({ result });
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
