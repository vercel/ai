/*
 * Stops an E2B sandbox session and resumes it by ID. `stop()` pauses the
 * sandbox, so after `resumeE2BNetworkSandboxSession()` its files, its running
 * processes, its listed ports, and its port URL are the same as before.
 * `destroy()` then removes it for good.
 */
import {
  createE2BNetworkSandboxSession,
  resumeE2BNetworkSandboxSession,
} from '@ai-sdk/sandbox-e2b';
import { run } from '../lib/run';

const port = 4000;

run(async () => {
  process.exitCode = 1;

  const session = await createE2BNetworkSandboxSession({
    ports: [port],
    timeoutMs: 5 * 60 * 1000,
  });
  let activeSession = session;
  try {
    await session.writeTextFile({ path: 'state.txt', content: 'kept' });
    // A process that keeps counting proves that memory survives the pause.
    await session.spawn({
      command:
        'i=0; while true; do i=$((i+1)); echo $i > counter.txt; sleep 1; done',
    });
    await waitForCounter(session, 1);
    const endpoint = await session.getPortEndpoint({ port, protocol: 'ws' });

    await session.stop();
    await session.stop();
    console.log('[stopped] sandbox', session.id);

    activeSession = await resumeE2BNetworkSandboxSession({
      sandboxId: session.id,
      timeoutMs: 5 * 60 * 1000,
    });
    console.log('[resumed] sandbox', activeSession.id);

    const state = await activeSession.readTextFile({ path: 'state.txt' });
    const counterAfterResume = await readCounter(activeSession);
    const counterLater = await waitForCounter(
      activeSession,
      counterAfterResume + 1,
    );
    const resumedEndpoint = await activeSession.getPortEndpoint({
      port,
      protocol: 'ws',
    });
    console.log('file:', state);
    console.log('counter:', counterAfterResume, '->', counterLater);
    console.log('ports:', activeSession.ports);
    console.log('endpoint:', resumedEndpoint.url);

    if (activeSession.id !== session.id) {
      throw new Error('the resumed session has a different ID');
    }
    if (state !== 'kept') {
      throw new Error('the file did not survive stop and resume');
    }
    if (activeSession.ports[0] !== port) {
      throw new Error('the resumed session does not list its ports');
    }
    if (resumedEndpoint.url !== endpoint.url) {
      throw new Error('the port URL changed after stop and resume');
    }

    // A stopped sandbox can be destroyed, after which it cannot be resumed.
    await activeSession.stop();
    await activeSession.destroy();
    await activeSession.destroy();
    const resumedAfterDestroy = await resumeE2BNetworkSandboxSession({
      sandboxId: session.id,
    }).then(
      () => true,
      error => {
        console.log('resume after destroy:', String(error));
        return false;
      },
    );
    if (resumedAfterDestroy) {
      throw new Error('the destroyed sandbox could still be resumed');
    }

    console.log('ok: stop pauses the sandbox and resume restores it');
    process.exitCode = 0;
  } finally {
    await activeSession.destroy();
  }
});

type Session = Awaited<ReturnType<typeof createE2BNetworkSandboxSession>>;

async function readCounter(session: Session): Promise<number> {
  return Number(await session.readTextFile({ path: 'counter.txt' }));
}

async function waitForCounter(
  session: Session,
  minimum: number,
): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const counter = await readCounter(session);
    if (counter >= minimum) return counter;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`the counter did not reach ${minimum}`);
}
