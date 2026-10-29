import type { Sandbox } from '@vercel/sandbox';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveSandboxFromSnapshot,
  ensureTemplateSnapshot,
  pollForTemplateSnapshot,
} from './utils';

const { createMock, getOrCreateMock, snapshotListMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getOrCreateMock: vi.fn(),
  snapshotListMock: vi.fn(),
}));

vi.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: createMock,
    getOrCreate: getOrCreateMock,
  },
  Snapshot: { list: snapshotListMock },
}));

function createSandboxMock(options: Record<string, unknown> = {}) {
  return {
    snapshot: vi.fn(async () => ({ snapshotId: 'snap_derived' })),
    ...options,
  } as unknown as Sandbox;
}

function createSnapshotPage(snapshots: Array<Record<string, unknown>>) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* snapshots;
    },
  };
}

function createOptions(
  overrides: Partial<Parameters<typeof ensureTemplateSnapshot>[0]> = {},
) {
  return {
    baseParams: { runtime: 'node24' as const, timeout: 60_000 },
    templateName: 'prepared-template',
    lookupParams: {},
    onCreate: vi.fn(async (_sandbox: Sandbox) => {}),
    ...overrides,
  };
}

describe('Vercel template snapshots', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    snapshotListMock.mockResolvedValue(createSnapshotPage([]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prepares and manually snapshots a named template once when a cache is supplied', async () => {
    const sandbox = createSandboxMock();
    getOrCreateMock.mockImplementation(async options => {
      await options.onCreate(sandbox);
      return sandbox;
    });
    const onCreate = vi.fn(async (_sandbox: Sandbox) => {});
    const abortSignal = new AbortController().signal;
    const snapshotCache = new Map<string, string>();
    const options = createOptions({
      abortSignal,
      onCreate,
      snapshotCache,
    });

    expect(await ensureTemplateSnapshot(options)).toBe('snap_derived');
    expect(await ensureTemplateSnapshot(options)).toBe('snap_derived');

    expect(getOrCreateMock).toHaveBeenCalledOnce();
    expect(getOrCreateMock).toHaveBeenCalledWith({
      runtime: 'node24',
      timeout: 60_000,
      name: 'prepared-template',
      persistent: false,
      snapshotExpiration: 0,
      onCreate: expect.any(Function),
      signal: abortSignal,
    });
    expect(onCreate).toHaveBeenCalledOnce();
    expect(sandbox.snapshot).toHaveBeenCalledOnce();
    expect(sandbox.snapshot).toHaveBeenCalledWith({
      expiration: 0,
      signal: abortSignal,
    });
    expect(snapshotCache.get('prepared-template')).toBe('snap_derived');
  });

  it('makes concurrent callers wait for the creator to publish a manual snapshot', async () => {
    let finishPreparation: (() => void) | undefined;
    const preparationGate = new Promise<void>(resolve => {
      finishPreparation = resolve;
    });
    const snapshots: Array<Record<string, unknown>> = [];
    const sandbox = createSandboxMock({
      snapshot: vi.fn(async () => {
        snapshots.push({
          id: 'snap_derived',
          status: 'created',
          creationMethod: 'manual',
        });
        return { snapshotId: 'snap_derived' };
      }),
    });
    let creatorClaimed = false;
    getOrCreateMock.mockImplementation(async options => {
      if (!creatorClaimed) {
        creatorClaimed = true;
        await options.onCreate(sandbox);
      }
      return sandbox;
    });
    snapshotListMock.mockImplementation(async () =>
      createSnapshotPage(snapshots),
    );
    const onCreate = vi.fn(async (_sandbox: Sandbox) => preparationGate);
    const options = createOptions({ onCreate });

    const creator = ensureTemplateSnapshot(options);
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    const waiter = ensureTemplateSnapshot(options);
    await vi.waitFor(() => expect(snapshotListMock).toHaveBeenCalled());

    finishPreparation?.();
    await expect(Promise.all([creator, waiter])).resolves.toEqual([
      'snap_derived',
      'snap_derived',
    ]);
    expect(onCreate).toHaveBeenCalledOnce();
    expect(sandbox.snapshot).toHaveBeenCalledOnce();
  });

  it('waits for the winner when concurrent builders hit a name conflict', async () => {
    vi.useFakeTimers();
    const sandbox = createSandboxMock();
    const snapshotCache = new Map<string, string>();
    const conflict = Object.assign(
      new Error(
        "Status code 400 is not ok: A sandbox with the name 'prepared-template' already exists for this project.",
      ),
      {
        response: { status: 400 },
        json: {
          error: {
            message:
              "A sandbox with the name 'prepared-template' already exists for this project.",
          },
        },
      },
    );
    getOrCreateMock.mockRejectedValueOnce(conflict);
    snapshotListMock
      .mockResolvedValueOnce(createSnapshotPage([]))
      .mockResolvedValueOnce(
        createSnapshotPage([
          {
            id: 'snap_manual',
            status: 'created',
            creationMethod: 'manual',
          },
        ]),
      );

    const pending = ensureTemplateSnapshot(createOptions({ snapshotCache }));
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBe('snap_manual');
    expect(getOrCreateMock).toHaveBeenCalledOnce();
    expect(snapshotListMock).toHaveBeenCalledTimes(2);
    expect(snapshotCache.get('prepared-template')).toBe('snap_manual');
    expect(sandbox.snapshot).not.toHaveBeenCalled();
  });

  it('waits for a manual snapshot published after 30 seconds', async () => {
    vi.useFakeTimers();
    getOrCreateMock.mockResolvedValue(createSandboxMock());
    const snapshotAvailableAt = Date.now() + 30_500;
    snapshotListMock.mockImplementation(async () =>
      createSnapshotPage(
        Date.now() >= snapshotAvailableAt
          ? [
              {
                id: 'snap_manual',
                status: 'created',
                creationMethod: 'manual',
              },
            ]
          : [],
      ),
    );

    const pending = ensureTemplateSnapshot(createOptions());
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(pending).resolves.toBe('snap_manual');
  });

  it('ignores automatic snapshots while waiting for a prepared template', async () => {
    getOrCreateMock.mockResolvedValue(createSandboxMock());
    snapshotListMock
      .mockResolvedValueOnce(
        createSnapshotPage([
          {
            id: 'snap_automatic',
            status: 'created',
            creationMethod: 'automatic',
          },
        ]),
      )
      .mockResolvedValueOnce(
        createSnapshotPage([
          {
            id: 'snap_manual',
            status: 'created',
            creationMethod: 'manual',
          },
        ]),
      );

    const pending = ensureTemplateSnapshot(createOptions());
    await vi.waitFor(() => expect(snapshotListMock).toHaveBeenCalledTimes(2));
    await expect(pending).resolves.toBe('snap_manual');
  });

  it('times out when no manual snapshot is published', async () => {
    vi.useFakeTimers();
    getOrCreateMock.mockResolvedValue(createSandboxMock());

    const pending = ensureTemplateSnapshot(createOptions());
    const rejection = expect(pending).rejects.toThrow(
      'Timed out waiting for snapshot',
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;
  });

  it('keeps the default timeout when polling for a snapshot directly', async () => {
    vi.useFakeTimers();

    const pending = pollForTemplateSnapshot({
      name: 'prepared-template',
      lookupParams: {},
      abortSignal: undefined,
    });
    const rejection = expect(pending).rejects.toThrow(
      'Timed out waiting for snapshot',
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
  });

  it('forks a live sandbox with the derived snapshot and its own name', async () => {
    await createLiveSandboxFromSnapshot({
      baseParams: {
        image: 'vercel/sandbox/universal',
        timeout: 60_000,
        persistent: true,
      },
      snapshotId: 'snap_derived',
      liveName: 'live-session',
    });

    expect(createMock).toHaveBeenCalledWith({
      timeout: 60_000,
      persistent: true,
      name: 'live-session',
      source: { type: 'snapshot', snapshotId: 'snap_derived' },
    });
  });

  it('keeps persistent: false on the live sandbox so stopping it writes no snapshot', async () => {
    await createLiveSandboxFromSnapshot({
      baseParams: {
        runtime: 'node24',
        timeout: 60_000,
        persistent: false,
      },
      snapshotId: 'snap_derived',
    });

    expect(createMock).toHaveBeenCalledWith({
      timeout: 60_000,
      persistent: false,
      source: { type: 'snapshot', snapshotId: 'snap_derived' },
    });
  });
});
