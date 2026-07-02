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
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const first = await agent.stream({
      session,
      prompt: 'Say hello in one word.',
    });
    await printFullStream({ result: first });

    const resumeState = await session.detach();
    console.log(
      'detached with agentId:',
      (resumeState.data as { agentId?: string }).agentId,
    );

    const resumed = await agent.createSession({ resumeFrom: resumeState });
    const second = await agent.stream({
      session: resumed,
      prompt: 'Now say goodbye in one word.',
    });
    await printFullStream({ result: second });
    await resumed.destroy();
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    try {
      await session.destroy();
    } catch {}
    process.exit(exitCode);
  }
});
