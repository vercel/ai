import type { Sandbox } from '@vercel/sandbox';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveSandboxFromSnapshot, ensureTemplateSnapshot } from './utils';

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
