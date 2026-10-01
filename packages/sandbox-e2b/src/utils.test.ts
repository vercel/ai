import { HarnessSandboxAuthenticationError } from '@ai-sdk/harness';
import { AuthenticationError, type Sandbox } from 'e2b';
import type * as E2BModule from 'e2b';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  PORTS_METADATA_KEY,
  ensureTemplateSnapshot,
  normalizePorts,
  parsePortsMetadata,
  resolveSandboxWorkingDirectory,
  serializePortsMetadata,
  withDefaultSandboxSettings,
  withE2BSandboxAuthenticationError,
} from './utils';

const { createMock, listSnapshotsMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  listSnapshotsMock: vi.fn(),
}));

vi.mock('e2b', async importOriginal => ({
  ...(await importOriginal<typeof E2BModule>()),
  Sandbox: {
    create: createMock,
    listSnapshots: listSnapshotsMock,
  },
}));

/**
 * Mimics the `e2b` snapshot paginator: one `nextItems()` call per page.
 */
function mockSnapshotPages(
  pages: Array<Array<{ snapshotId: string; names: string[] }>>,
) {
  const nextItems = vi.fn();
  let index = 0;
  const paginator = {
    get hasNext() {
      return index < pages.length;
    },
    nextItems: nextItems.mockImplementation(async () => pages[index++]),
  };
  listSnapshotsMock.mockReturnValue(paginator);
  return nextItems;
}

function makeMockSandbox() {
  const createSnapshot = vi.fn(async () => ({
    snapshotId: 'snapshot-new',
    names: [],
  }));
  const kill = vi.fn(async () => true);
  const sandbox = { sandboxId: 'sbx_prepare', createSnapshot, kill };
  return {
    sandbox: sandbox as unknown as Sandbox,
    spies: { createSnapshot, kill },
  };
}

describe('ports', () => {
  it('keeps the order and removes duplicates', () => {
    expect(normalizePorts([4000, 3000, 4000])).toEqual([4000, 3000]);
    expect(normalizePorts(undefined)).toEqual([]);
  });

  it('rejects values that are not ports', () => {
    for (const port of [0, -1, 65_536, 80.5, Number.NaN]) {
      expect(() => normalizePorts([port])).toThrow('Invalid sandbox port');
    }
  });

  it('round-trips through sandbox metadata', () => {
    const metadata = {
      [PORTS_METADATA_KEY]: serializePortsMetadata([4000, 3000]),
    };

    expect(metadata).toEqual({ 'ai-sdk-sandbox-ports': '4000,3000' });
    expect(parsePortsMetadata(metadata)).toEqual([4000, 3000]);
    expect(
      parsePortsMetadata({ [PORTS_METADATA_KEY]: serializePortsMetadata([]) }),
    ).toEqual([]);
  });

  it('ignores metadata that this package did not write', () => {
    expect(parsePortsMetadata(undefined)).toEqual([]);
    expect(parsePortsMetadata({ owner: 'someone' })).toEqual([]);
    expect(parsePortsMetadata({ [PORTS_METADATA_KEY]: '4000,abc' })).toEqual(
      [],
    );
    expect(parsePortsMetadata({ [PORTS_METADATA_KEY]: '99999' })).toEqual([]);
  });
});

describe('withDefaultSandboxSettings', () => {
  it('defaults the timeout to 30 minutes and keeps an explicit one', () => {
    expect(withDefaultSandboxSettings({})).toEqual({
      timeoutMs: DEFAULT_SANDBOX_TIMEOUT_MS,
    });
    expect(DEFAULT_SANDBOX_TIMEOUT_MS).toBe(1_800_000);
    expect(
      withDefaultSandboxSettings({ timeoutMs: 60_000, envs: { A: '1' } }),
    ).toEqual({ timeoutMs: 60_000, envs: { A: '1' } });
  });
});

describe('withE2BSandboxAuthenticationError', () => {
  it('maps an E2B authentication failure and keeps it as the cause', async () => {
    const cause = new AuthenticationError('Unauthorized');

    const result = withE2BSandboxAuthenticationError(async () => {
      throw cause;
    });

    await expect(result).rejects.toSatisfy(
      HarnessSandboxAuthenticationError.isInstance,
    );
    await expect(result).rejects.toMatchObject({
      sandboxProviderId: 'e2b-sandbox',
      cause,
    });
    await expect(result).rejects.toThrow('E2B_API_KEY');
  });

  it('passes other failures and results through', async () => {
    const failure = new Error('rate limited');

    await expect(
      withE2BSandboxAuthenticationError(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await withE2BSandboxAuthenticationError(async () => 'ok')).toBe(
      'ok',
    );
  });
});

describe('resolveSandboxWorkingDirectory', () => {
  it('reads the directory that commands run in', async () => {
    const run = vi.fn(async () => ({ stdout: '/home/user\n' }));
    const sandbox = { sandboxId: 'sbx', commands: { run } };
    const abortSignal = new AbortController().signal;

    expect(
      await resolveSandboxWorkingDirectory({
        sandbox: sandbox as unknown as Sandbox,
        abortSignal,
      }),
    ).toBe('/home/user');
    expect(run).toHaveBeenCalledWith('pwd', { signal: abortSignal });
  });

  it('fails when the sandbox reports no absolute path', async () => {
    const run = vi.fn(async () => ({ stdout: '' }));
    const sandbox = { sandboxId: 'sbx', commands: { run } };

    await expect(
      resolveSandboxWorkingDirectory({
        sandbox: sandbox as unknown as Sandbox,
      }),
    ).rejects.toThrow('Could not resolve the working directory');
  });
});

describe('ensureTemplateSnapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reuses the snapshot that E2B lists under the template name', async () => {
    const nextItems = mockSnapshotPages([
      [
        {
          snapshotId: 'snapshot-other',
          names: ['team/template-name-2:default'],
        },
        { snapshotId: 'snapshot-match', names: ['team/template-name:default'] },
      ],
    ]);
    const onCreate = vi.fn();

    const snapshotId = await ensureTemplateSnapshot({
      templateName: 'template-name',
      baseTemplate: 'node-template',
      createParams: { apiKey: 'key', domain: 'e2b.test', timeoutMs: 1000 },
      onCreate,
    });

    expect(snapshotId).toBe('snapshot-match');
    expect(listSnapshotsMock).toHaveBeenCalledWith({
      apiKey: 'key',
      domain: 'e2b.test',
      name: 'template-name',
    });
    expect(nextItems).toHaveBeenCalledWith({
      apiKey: 'key',
      domain: 'e2b.test',
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('finds the snapshot on a later page', async () => {
    mockSnapshotPages([
      [{ snapshotId: 'snapshot-other', names: ['other'] }],
      [{ snapshotId: 'snapshot-match', names: ['template-name'] }],
    ]);

    expect(
      await ensureTemplateSnapshot({
        templateName: 'template-name',
        baseTemplate: undefined,
        createParams: {},
        onCreate: vi.fn(),
      }),
    ).toBe('snapshot-match');
  });

  it('prepares a sandbox from the base template, snapshots it, and kills it', async () => {
    mockSnapshotPages([[]]);
    const { sandbox, spies } = makeMockSandbox();
    createMock.mockResolvedValue(sandbox);
    const signal = new AbortController().signal;
    const createParams = { timeoutMs: 1000, signal };
    const order: string[] = [];
    spies.createSnapshot.mockImplementationOnce(async () => {
      order.push('snapshot');
      return { snapshotId: 'snapshot-new', names: [] };
    });
    spies.kill.mockImplementationOnce(async () => {
      order.push('kill');
      return true;
    });

    const snapshotId = await ensureTemplateSnapshot({
      templateName: 'template-name',
      baseTemplate: 'node-template',
      createParams,
      onCreate: async prepared => {
        expect(prepared).toBe(sandbox);
        order.push('prepare');
      },
    });

    expect(snapshotId).toBe('snapshot-new');
    expect(createMock).toHaveBeenCalledExactlyOnceWith(
      'node-template',
      createParams,
    );
    expect(spies.createSnapshot).toHaveBeenCalledWith({
      name: 'template-name',
      signal,
    });
    expect(order).toEqual(['prepare', 'snapshot', 'kill']);
  });

  it('starts from the E2B default template when no base template is given', async () => {
    mockSnapshotPages([[]]);
    createMock.mockResolvedValue(makeMockSandbox().sandbox);

    await ensureTemplateSnapshot({
      templateName: 'template-name',
      baseTemplate: undefined,
      createParams: { timeoutMs: 1000 },
      onCreate: vi.fn(),
    });

    expect(createMock).toHaveBeenCalledExactlyOnceWith({ timeoutMs: 1000 });
  });

  it('kills the sandbox and takes no snapshot when preparation fails', async () => {
    mockSnapshotPages([[]]);
    const { sandbox, spies } = makeMockSandbox();
    createMock.mockResolvedValue(sandbox);
    const failure = new Error('pnpm: command not found');

    await expect(
      ensureTemplateSnapshot({
        templateName: 'template-name',
        baseTemplate: undefined,
        createParams: {},
        onCreate: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);

    expect(spies.createSnapshot).not.toHaveBeenCalled();
    expect(spies.kill).toHaveBeenCalledOnce();
  });
});
