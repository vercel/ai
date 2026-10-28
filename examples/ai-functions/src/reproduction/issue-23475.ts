import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';

async function main() {
  const name = `repro-23475-${Date.now()}`;
  const responses: unknown[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (init?.method === 'POST') {
      responses.push({
        url: String(input),
        request: init.body == null ? null : JSON.parse(String(init.body)),
        status: response.status,
        response: await response.clone().json(),
      });
    }
    return response;
  };
  await createVercelNetworkSandboxSession({
    runtime: 'node24',
    persistent: false,
    name,
    fetch: recordingFetch,
    abortSignal: AbortSignal.timeout(90_000),
    template: { identity: 'repro-23475', prepare: async () => {} },
  });
  const live = await Sandbox.get({ name, fetch: recordingFetch });
  try {
    const persistent = live.persistent;
    console.log('persistent:', persistent);
    const stopped = await live.stop({ signal: AbortSignal.timeout(90_000) });
    if (stopped.status !== 'stopped') {
      throw new Error('Template sandbox did not finish stopping');
    }
    const snapshotId = stopped.sourceSnapshotId;
    if (!snapshotId) {
      throw new Error('Template source snapshot missing');
    }
    const direct = await Sandbox.create({
      name: `${name}-direct`,
      source: { type: 'snapshot', snapshotId },
      persistent: false,
      timeout: 30 * 60 * 1_000,
      fetch: recordingFetch,
      signal: AbortSignal.timeout(90_000),
    });
    try {
      const directPersistent = direct.persistent;
      const directStopped = await direct.stop({
        signal: AbortSignal.timeout(90_000),
      });
      console.log('recorded live responses:', JSON.stringify(responses));
      if (
        directStopped.status !== 'stopped' ||
        directPersistent ||
        directStopped.snapshot
      ) {
        throw new Error(
          'Direct provider control did not honor persistent:false',
        );
      }
      console.log('Direct provider control: nonpersistent, no stop snapshot');
    } finally {
      await direct.delete({ deleteOrphanSnapshots: true });
    }
    if (stopped.snapshot) {
      console.log('Unwanted snapshot sizeBytes:', stopped.snapshot.sizeBytes);
      throw new Error(
        'ISSUE-23475: persistent:false template sandbox wrote an unwanted stop snapshot',
      );
    }
    if (persistent) {
      throw new Error('Template sandbox did not honor persistent:false');
    }
    console.log('Template sandbox: nonpersistent, no stop snapshot');
  } finally {
    await live.delete({ deleteOrphanSnapshots: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
