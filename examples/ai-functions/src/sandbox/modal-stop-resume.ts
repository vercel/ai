/*
 * Verifies that a stopped Modal sandbox can be resumed: `stop()` snapshots
 * the filesystem and terminates the sandbox, and
 * `resumeModalNetworkSandboxSession()` starts a new sandbox from that
 * snapshot under the same ID.
 */
import {
  createModalNetworkSandboxSession,
  resumeModalNetworkSandboxSession,
} from '@ai-sdk/sandbox-modal';
import { run } from '../lib/run';

const creationOptions = {
  encryptedPorts: [4000],
  timeoutMs: 5 * 60 * 1000,
  cpu: 0.25,
  memoryMiB: 512,
};

run(async () => {
  process.exitCode = 1;

  const session = await createModalNetworkSandboxSession({
    sandboxId: `stop-resume-${crypto.randomUUID()}`,
    ...creationOptions,
  });
  let activeSession = session;
  try {
    await session.writeTextFile({ path: 'notes.txt', content: 'kept' });
    await session.run({ command: 'echo kept > "$HOME/home-notes.txt"' });
    const endpoint = await session.getPortEndpoint({ port: 4000 });
    console.log('id:', session.id);
    console.log('endpoint before stop:', endpoint.url);

    await session.stop();
    console.log('stopped');

    // Modal does not keep the configuration of a stopped sandbox, so the
    // creation options are passed again.
    activeSession = await resumeModalNetworkSandboxSession({
      sandboxId: session.id,
      ...creationOptions,
    });
    const restoredEndpoint = await activeSession.getPortEndpoint({
      port: 4000,
    });
    const workingDirectoryFile = await activeSession.readTextFile({
      path: 'notes.txt',
    });
    const homeFile = await activeSession.run({
      command: 'cat "$HOME/home-notes.txt"',
    });
    console.log('id after resume:', activeSession.id);
    console.log('ports after resume:', activeSession.ports);
    console.log('endpoint after resume:', restoredEndpoint.url);
    console.log('working directory file:', workingDirectoryFile);
    console.log('home directory file:', homeFile.stdout.trim());

    if (activeSession.id !== session.id) {
      throw new Error('the session ID changed across stop and resume');
    }
    if (workingDirectoryFile !== 'kept' || homeFile.stdout.trim() !== 'kept') {
      throw new Error('the filesystem was not restored');
    }
    if (restoredEndpoint.url === endpoint.url) {
      throw new Error('expected the restored sandbox to have a new tunnel');
    }

    console.log('ok: the stopped Modal sandbox was resumed');
    process.exitCode = 0;
  } finally {
    await activeSession.destroy();
  }
});
