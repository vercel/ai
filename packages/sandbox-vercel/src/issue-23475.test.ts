import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createLiveSandboxFromSnapshot } from './utils';

it('does not write a stop snapshot for a nonpersistent template sandbox', async () => {
  // Unmodified create/stop response bodies recorded from the live provider.
  const fixture = JSON.parse(
    readFileSync(
      new URL('./__fixtures__/issue-23475.json', import.meta.url),
      'utf8',
    ),
  );
  let persistent: boolean | undefined;
  const replayFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    expect(init?.method).toBe('POST');
    if (url.pathname === '/api/v3/sandboxes') {
      persistent = JSON.parse(String(init?.body)).persistent ?? true;
      return Response.json(
        persistent ? fixture.sdkCreate : fixture.directCreate,
      );
    }
    if (url.pathname.endsWith('/stop')) {
      return Response.json(persistent ? fixture.sdkStop : fixture.directStop);
    }
    throw new Error(`Unexpected provider request: ${url.pathname}`);
  };
  const sandbox = await createLiveSandboxFromSnapshot({
    baseParams: {
      runtime: 'node24',
      persistent: false,
      token: 'fixture-token',
      teamId: 'fixture-team',
      projectId: 'fixture-project',
      fetch: replayFetch,
    },
    snapshotId: fixture.sdkCreate.session.sourceSnapshotId,
    liveName: 'repro-23475',
  });
  const stopped = await sandbox.stop();
  expect(stopped.status).toBe('stopped');
  expect(
    stopped.snapshot,
    'ISSUE-23475: persistent:false template sandbox wrote an unwanted stop snapshot',
  ).toBeUndefined();
  expect(sandbox.persistent).toBe(false);
});
