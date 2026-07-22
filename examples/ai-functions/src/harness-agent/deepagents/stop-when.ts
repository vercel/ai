import { HarnessAgent } from '@ai-sdk/harness/agent';
import { deepAgents } from '@ai-sdk/harness-deepagents';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { isStepCount } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const prompt = `
Create a small TypeScript command-line program in this workspace.

Requirements:
- Write the program to src/index.ts.
- Have it print the first ten Fibonacci numbers.
- Run or inspect the program to verify it.
- Summarize the completed work.
`;

run(async () => {
  const agent = new HarnessAgent({
    harness: deepAgents,
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    stopWhen: isStepCount(1),
  });

  let exitCode = 0;
  let session = await agent.createSession();
  let isFirstSlice = true;
  try {
    for (let slice = 1; ; slice += 1) {
      console.log(`--- slice ${slice} ---`);
      const result = isFirstSlice
        ? await agent.stream({ session, prompt })
        : await agent.continueStream({ session });
      isFirstSlice = false;

      await printFullStream({ result });
      console.log('steps:', (await result.steps).length);

      if (!session.hasUnfinishedTurn()) {
        console.log('finishReason:', await result.finishReason);
        console.log('usage:', await result.usage);
        break;
      }

      const sessionId = session.sessionId;
      const continueFrom = await session.suspendTurn();
      session = await agent.createSession({ sessionId, continueFrom });
    }
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
