import type { NetworkPolicy, Sandbox } from '@vercel/sandbox';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVercelNetworkSandboxSession,
  createVercelNetworkSandboxSessionFromNativeSandbox,
  createVercelSandboxSessionFromNativeSandbox,
  resumeVercelNetworkSandboxSession,
} from './vercel-sandbox';

describe('new Vercel sandbox sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('adapts basic and network sessions with explicit native lifecycle', async () => {
    const { sandbox, spies } = makeMockSandbox();
    const basic = createVercelSandboxSessionFromNativeSandbox(sandbox);
    expect('stop' in basic).toBe(false);
    const adapted = createVercelNetworkSandboxSessionFromNativeSandbox(sandbox);
    await adapted.stop();
    await adapted.destroy();
    expect(spies.stop).toHaveBeenCalledTimes(2);
    expect(spies.delete).toHaveBeenCalledOnce();
  });

  it('rejects native sandbox inputs', async () => {
    await expect(
      createVercelNetworkSandboxSession({
        sandbox: makeMockSandbox().sandbox,
      } as never),
    ).rejects.toThrow('FromNativeSandbox');
  });

  it('creates a newly named sandbox without looking up that ID', async () => {
    const { sandbox } = makeMockSandbox();
    createMock.mockResolvedValue(sandbox);
    const session = await createVercelNetworkSandboxSession({
      sandboxId: 'live-session',
      runtime: 'node24',
    });
    expect(session.id).toBe('sbx_harness');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'live-session', runtime: 'node24' }),
    );
    expect(getMock).not.toHaveBeenCalled();
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });

  it('preserves native names and rejects a conflicting sandboxId', async () => {
    createMock.mockResolvedValue(makeMockSandbox().sandbox);
    await createVercelNetworkSandboxSession({
      name: 'same-name',
      sandboxId: 'same-name',
    });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'same-name' }),
    );
    createMock.mockClear();
    await expect(
      createVercelNetworkSandboxSession({
        name: 'native-name',
        sandboxId: 'other-name',
      }),
    ).rejects.toThrow('sandboxId and name must match');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('surfaces native duplicate-name failures without a preflight lookup', async () => {
    const conflict = new Error('sandbox name already exists');
    createMock.mockRejectedValueOnce(conflict);
    await expect(
      createVercelNetworkSandboxSession({ sandboxId: 'already-exists' }),
    ).rejects.toBe(conflict);
    expect(getMock).not.toHaveBeenCalled();
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });

  it('reattaches to a running or stopped named sandbox without creating one', async () => {
    const { sandbox, spies } = makeMockSandbox();
    getMock.mockImplementation(async ({ resume }) => {
      if (resume !== true) {
        throw new Error(
          'No active session. Run a command or call resume first.',
        );
      }
      return sandbox;
    });
    const nativeSignal = new AbortController().signal;
    const abortSignal = new AbortController().signal;
    for (const state of ['running', 'stopped']) {
      getMock.mockImplementationOnce(async ({ resume }) => {
        expect(resume).toBe(true);
        return state === 'stopped' ? makeMockSandbox().sandbox : sandbox;
      });
      const session = await resumeVercelNetworkSandboxSession({
        sandboxId: 'sbx_harness',
        token: 'token',
        teamId: 'team',
        projectId: 'project',
        signal: nativeSignal,
        abortSignal,
      });
      expect(session.id).toBe('sbx_harness');
      expect(getMock).toHaveBeenLastCalledWith({
        name: 'sbx_harness',
        resume: true,
        token: 'token',
        teamId: 'team',
        projectId: 'project',
        signal: abortSignal,
      });
    }
    expect(createMock).not.toHaveBeenCalled();
    expect(getOrCreateMock).not.toHaveBeenCalled();
    const session = await resumeVercelNetworkSandboxSession({
      sandboxId: 'sbx_harness',
    });
    await session.destroy();
    expect(spies.stop).toHaveBeenCalledOnce();
    expect(spies.delete).toHaveBeenCalledOnce();
  });

  it('rejects missing sandboxes and respects an aborted signal', async () => {
    const notFound = new Error('sandbox not found');
    getMock.mockRejectedValueOnce(notFound);
    await expect(
      resumeVercelNetworkSandboxSession({ sandboxId: 'missing' }),
    ).rejects.toBe(notFound);
    const controller = new AbortController();
    controller.abort();
    await expect(
      resumeVercelNetworkSandboxSession({
        sandboxId: 'missing',
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('derives a reusable snapshot from a source snapshot without using the live name', async () => {
    const { sandbox } = makeMockSandbox();
    const prepare = vi.fn(async () => {});
    const preparedNames = new Set<string>();
    getOrCreateMock.mockImplementation(
      async (opts: {
        name: string;
        onCreate: (sandbox: Sandbox) => Promise<void>;
      }) => {
        if (!preparedNames.has(opts.name)) {
          await opts.onCreate(sandbox);
          preparedNames.add(opts.name);
        }
        return { ...sandbox, currentSnapshotId: 'derived-snapshot' };
      },
    );
    createMock.mockResolvedValue(sandbox);
    const template = { identity: 'recipe-one', prepare };
    const create = (snapshotId: string, identity = template.identity) =>
      createVercelNetworkSandboxSession({
        source: { type: 'snapshot', snapshotId },
        sandboxId: 'live-name',
        template: { identity, prepare },
      });
    await create('base');
    await create('base');
    await create('other-base');
    await create('base', 'recipe-two');
    const calls = getOrCreateMock.mock.calls.map(([opts]) => opts);
    expect(calls[0].source).toEqual({ type: 'snapshot', snapshotId: 'base' });
    expect(calls[0].name).toMatch(/^ai-sdk-harness-v2-[a-f0-9]{24}$/);
    expect(calls[0].name).toBe(calls[1].name);
    expect(calls[0].name).not.toBe(calls[2].name);
    expect(calls[0].name).not.toBe(calls[3].name);
    expect(calls[0].name).not.toBe('live-name');
    expect(createMock.mock.calls.map(([opts]) => opts)).toEqual([
      expect.objectContaining({
        name: 'live-name',
        source: { type: 'snapshot', snapshotId: 'derived-snapshot' },
      }),
      expect.objectContaining({
        name: 'live-name',
        source: { type: 'snapshot', snapshotId: 'derived-snapshot' },
      }),
      expect.objectContaining({
        name: 'live-name',
        source: { type: 'snapshot', snapshotId: 'derived-snapshot' },
      }),
      expect.objectContaining({
        name: 'live-name',
        source: { type: 'snapshot', snapshotId: 'derived-snapshot' },
      }),
    ]);
    expect(prepare).toHaveBeenCalledTimes(3);
  });
});

const { createMock, getMock, getOrCreateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getMock: vi.fn(),
  getOrCreateMock: vi.fn(),
}));

vi.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: createMock,
    get: getMock,
    getOrCreate: getOrCreateMock,
  },
}));

type MockSpies = {
  domain: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  runCommand: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  routes: Array<{ port: number }>;
  networkPolicy: NetworkPolicy | undefined;
};

function makeMockSandbox(overrides: Partial<MockSpies> = {}) {
  const domain = overrides.domain ?? vi.fn();
  const update = overrides.update ?? vi.fn(async () => {});
  const runCommand = overrides.runCommand ?? vi.fn();
  const stop = overrides.stop ?? vi.fn(async () => {});
  const deleteSandbox = overrides.delete ?? vi.fn(async () => {});
  const routes: Array<{ port: number }> = overrides.routes ?? [{ port: 4000 }];
  const networkPolicy = overrides.networkPolicy;
  const sandbox = {
    name: 'sbx_harness',
    domain,
    update,
    runCommand,
    stop,
    delete: deleteSandbox,
    routes,
    networkPolicy,
    currentSession: () => ({
      cwd: '/vercel/sandbox',
      networkPolicy,
    }),
  } as unknown as Sandbox;
  return {
    sandbox,
    spies: {
      domain,
      update,
      runCommand,
      stop,
      delete: deleteSandbox,
      routes,
      networkPolicy,
    },
  };
}
