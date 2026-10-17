import type { Sandbox } from '@vercel/sandbox';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BaseCreateSandboxParams,
  createLiveSandboxFromSnapshot,
  ensureTemplateSnapshot,
} from './utils';

const { createMock, getOrCreateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getOrCreateMock: vi.fn(),
}));

vi.mock('@vercel/sandbox', () => ({
  Sandbox: { create: createMock, getOrCreate: getOrCreateMock },
}));

describe('Vercel template snapshots', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('prepares and publishes a named template once when a cache is supplied', async () => {
    const stop = vi.fn(async () => ({ snapshot: { id: 'snap_derived' } }));
    getOrCreateMock.mockResolvedValue({ currentSnapshotId: undefined, stop });
    const onCreate = vi.fn(async (_sandbox: Sandbox) => {});
    const abortSignal = new AbortController().signal;
    const snapshotCache = new Map<string, string>();
    const options = {
      baseParams: { runtime: 'node24' as const, timeout: 60_000 },
      templateName: 'prepared-template',
      lookupParams: {},
      abortSignal,
      onCreate,
      snapshotCache,
    };

    expect(await ensureTemplateSnapshot(options)).toBe('snap_derived');
    expect(await ensureTemplateSnapshot(options)).toBe('snap_derived');

    expect(getOrCreateMock).toHaveBeenCalledOnce();
    expect(getOrCreateMock).toHaveBeenCalledWith({
      runtime: 'node24',
      timeout: 60_000,
      name: 'prepared-template',
      persistent: true,
      snapshotExpiration: 0,
      onCreate,
      signal: abortSignal,
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledWith({ signal: abortSignal });
    expect(snapshotCache.get('prepared-template')).toBe('snap_derived');
  });

  it('snapshots a template created from a snapshot source instead of reusing the source snapshot', async () => {
    const stop = vi.fn(async () => ({ snapshot: { id: 'snap_derived' } }));
    getOrCreateMock.mockImplementation(
      async (opts: { onCreate: (sandbox: Sandbox) => Promise<void> }) => {
        const prepared = { currentSnapshotId: 'snap_source', stop };
        await opts.onCreate(prepared as unknown as Sandbox);
        return prepared;
      },
    );
    const onCreate = vi.fn(async (_sandbox: Sandbox) => {});

    const snapshotId = await ensureTemplateSnapshot({
      // Snapshot sources reach this function at run time, outside its type.
      baseParams: {
        source: { type: 'snapshot', snapshotId: 'snap_source' },
        timeout: 60_000,
      } as unknown as BaseCreateSandboxParams,
      templateName: 'prepared-template',
      lookupParams: {},
      onCreate,
    });

    expect(onCreate).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(snapshotId).toBe('snap_derived');
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
      name: 'live-session',
      source: { type: 'snapshot', snapshotId: 'snap_derived' },
    });
  });
});
