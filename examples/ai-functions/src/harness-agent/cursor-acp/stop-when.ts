import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { isStepCount } from 'ai';
import { createCursorACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCursorACP(),
    stopWhen: isStepCount(1),
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session = await agent.createSession({ sandboxSession });
  let isFirstSlice = true;
  let observedSuspendedSlice = false;
  try {
    for (let slice = 1; ; slice += 1) {
      console.log(`--- slice ${slice} ---`);
      const result = isFirstSlice
        ? await agent.stream({
            session,
            prompt:
              'Run `printf inferred-step` in the shell, then explain the exact output in one sentence.',
          })
        : await agent.continueStream({ session });
      isFirstSlice = false;

      await printFullStream({ result });
      console.log('steps:', (await result.steps).length);

      if (!session.hasUnfinishedTurn()) {
        if (!observedSuspendedSlice) {
          throw new Error(
            'Expected stopWhen to suspend the turn after an inferred tool step.',
          );
        }
        console.log('finishReason:', await result.finishReason);
        console.log('usage:', await result.usage);
        break;
      }

      observedSuspendedSlice = true;
      const sessionId = session.sessionId;
      const continueFrom = await session.suspendTurn();
      session = await agent.createSession({
        sandboxSession,
        sessionId,
        continueFrom,
      });
    }
  } finally {
    await session.destroy();
    await sandboxSession.destroy();
  }
});
