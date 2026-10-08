import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, test, vi } from 'vitest';
import type { HarnessV1NetworkSandboxSession } from '../v1';
import { createLazyNetworkSandboxSession } from './create-lazy-network-sandbox-session';

function makeAcquiredSession() {
  const run = vi.fn(async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }));
  const readTextFile = vi.fn(async () => 'content');
  const restrictedSession = { run, readTextFile } as unknown as SandboxSession;
  const stop = vi.fn(async () => {});
  const destroy = vi.fn(async () => {});
  const getPortEndpoint = vi.fn(async () => ({ url: 'ws://example.test/' }));
  const session = {
    id: 'sandbox-1',
    description: 'acquired sandbox',
    defaultWorkingDirectory: '/sandbox',
    ports: [4000],
    run,
    readTextFile,
    getPortEndpoint,
    getPortUrl: async () => 'ws://example.test/',
    stop,
    destroy,
    restricted: () => restrictedSession,
  } as unknown as HarnessV1NetworkSandboxSession;
  return { session, run, readTextFile, stop, destroy, getPortEndpoint };
}

describe('createLazyNetworkSandboxSession', () => {
  test('a session that is never used does not acquire the sandbox', async () => {
    const acquire = vi.fn(async () => makeAcquiredSession().session);
    const session = createLazyNetworkSandboxSession({
      acquire,
      defaultWorkingDirectory: '/sandbox',
      ports: [4000],
      description: 'lazy sandbox',
    });

    expect(session.defaultWorkingDirectory).toBe('/sandbox');
    expect(session.ports).toEqual([4000]);
    expect(session.description).toBe('lazy sandbox');
    expect(session.restricted().description).toBe('lazy sandbox');
    expect(() => session.id).toThrow(
      'Lazy sandbox session has not been acquired yet.',
    );
    await session.stop();
    await session.destroy();
    expect(acquire).not.toHaveBeenCalled();
  });

  test('concurrent first operations on the session and its restricted view acquire once', async () => {
    const acquired = makeAcquiredSession();
    const acquire = vi.fn(async () => acquired.session);
    const session = createLazyNetworkSandboxSession({
      acquire,
      defaultWorkingDirectory: '/sandbox',
    });

    expect(acquire).not.toHaveBeenCalled();
    const [runResult, text] = await Promise.all([
      session.run({ command: 'echo hi' }),
      session.restricted().readTextFile({ path: '/sandbox/a.txt' }),
    ]);

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(runResult).toEqual({ exitCode: 0, stdout: 'ok', stderr: '' });
    expect(text).toBe('content');
    expect(acquired.run).toHaveBeenCalledWith({ command: 'echo hi' });
    expect(acquired.readTextFile).toHaveBeenCalledWith({
      path: '/sandbox/a.txt',
    });
  });

  test('a rejected acquisition stays rejected without acquiring again', async () => {
    const error = new Error('sandbox quota exceeded');
    const acquire = vi.fn(async (): Promise<HarnessV1NetworkSandboxSession> => {
      throw error;
    });
    const session = createLazyNetworkSandboxSession({
      acquire,
      defaultWorkingDirectory: '/sandbox',
    });

    await expect(session.run({ command: 'true' })).rejects.toBe(error);
    await expect(session.readTextFile({ path: '/sandbox/a.txt' })).rejects.toBe(
      error,
    );
    expect(acquire).toHaveBeenCalledTimes(1);
    await session.stop();
    await session.destroy();
  });

  test('an acquire that throws synchronously stays rejected without acquiring again', async () => {
    const error = new Error('sandbox credentials missing');
    const acquire = vi.fn((): Promise<HarnessV1NetworkSandboxSession> => {
      throw error;
    });
    const session = createLazyNetworkSandboxSession({
      acquire,
      defaultWorkingDirectory: '/sandbox',
    });

    await expect(session.run({ command: 'true' })).rejects.toBe(error);
    await expect(session.run({ command: 'true' })).rejects.toBe(error);
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  test('id returns the acquired id after acquisition', async () => {
    const session = createLazyNetworkSandboxSession({
      acquire: async () => makeAcquiredSession().session,
      defaultWorkingDirectory: '/sandbox',
    });

    await session.run({ command: 'true' });

    expect(session.id).toBe('sandbox-1');
  });

  test('stop and destroy after acquisition delegate to the acquired session', async () => {
    const acquired = makeAcquiredSession();
    const session = createLazyNetworkSandboxSession({
      acquire: async () => acquired.session,
      defaultWorkingDirectory: '/sandbox',
    });

    await session.run({ command: 'true' });
    await session.stop();
    await session.destroy();

    expect(acquired.stop).toHaveBeenCalledTimes(1);
    expect(acquired.destroy).toHaveBeenCalledTimes(1);
  });

  test('getPortEndpoint acquires the sandbox', async () => {
    const acquired = makeAcquiredSession();
    const acquire = vi.fn(async () => acquired.session);
    const session = createLazyNetworkSandboxSession({
      acquire,
      defaultWorkingDirectory: '/sandbox',
      ports: [4000],
    });

    expect(acquire).not.toHaveBeenCalled();
    await expect(
      session.getPortEndpoint({ port: 4000, protocol: 'ws' }),
    ).resolves.toEqual({ url: 'ws://example.test/' });

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquired.getPortEndpoint).toHaveBeenCalledWith({
      port: 4000,
      protocol: 'ws',
    });
  });
});
