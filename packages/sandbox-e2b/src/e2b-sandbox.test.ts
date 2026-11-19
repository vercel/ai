import {
  HarnessSandboxAuthenticationError,
  type HarnessV1SandboxTemplate,
} from '@ai-sdk/harness';
import { AuthenticationError, SandboxNotFoundError, type Sandbox } from 'e2b';
import type * as E2BModule from 'e2b';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createE2BNetworkSandboxSession,
  createE2BNetworkSandboxSessionFromNativeSandbox,
  createE2BSandboxSessionFromNativeSandbox,
  resumeE2BNetworkSandboxSession,
} from './e2b-sandbox';

const THIRTY_MINUTES = 30 * 60 * 1000;

describe('E2B sandbox sessions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('native adaptation', () => {
    it('adapts basic and network sessions with explicit native lifecycle', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const nativeSandbox = {
        sandbox,
        defaultWorkingDirectory: '/workspace',
        ports: [4000],
      };

      const basic = createE2BSandboxSessionFromNativeSandbox(nativeSandbox);
      expect('stop' in basic).toBe(false);
      expect(basic.description).toContain('sbx_harness');

      const adapted =
        createE2BNetworkSandboxSessionFromNativeSandbox(nativeSandbox);
      expect(adapted.id).toBe('sbx_harness');
      expect(adapted.defaultWorkingDirectory).toBe('/workspace');
      expect(adapted.ports).toEqual([4000]);
      await adapted.stop();
      await adapted.destroy();
      expect(spies.pause).toHaveBeenCalledOnce();
      expect(spies.kill).toHaveBeenCalledOnce();
      expect(spies.run).not.toHaveBeenCalled();
    });

    it('runs commands of an adapted session in its working directory', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.run.mockResolvedValueOnce({
        wait: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
        kill: async () => true,
      });

      const basic = createE2BSandboxSessionFromNativeSandbox({
        sandbox,
        defaultWorkingDirectory: '/workspace',
      });

      expect(await basic.run({ command: 'ls' })).toEqual({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      });
      expect(spies.run).toHaveBeenCalledWith('ls', {
        background: true,
        timeoutMs: 0,
        cwd: '/workspace',
      });
    });
  });

  describe('createE2BNetworkSandboxSession', () => {
    it('creates a sandbox from the E2B default template with a 30 minute timeout', async () => {
      const { sandbox } = makeMockSandbox();
      createMock.mockResolvedValue(sandbox);

      const session = await createE2BNetworkSandboxSession();

      expect(createMock).toHaveBeenCalledExactlyOnceWith({
        timeoutMs: THIRTY_MINUTES,
        metadata: { 'ai-sdk-sandbox-ports': '' },
      });
      expect(session.id).toBe('sbx_harness');
      expect(session.defaultWorkingDirectory).toBe('/home/user');
      expect(session.ports).toEqual([]);
      expect(connectMock).not.toHaveBeenCalled();
    });

    it('forwards native options, the base template, and the listed ports', async () => {
      const { sandbox } = makeMockSandbox();
      createMock.mockResolvedValue(sandbox);

      const session = await createE2BNetworkSandboxSession({
        baseTemplate: 'node-template',
        ports: [4000, 3000],
        apiKey: 'key',
        timeoutMs: 60_000,
        envs: { A: '1' },
        metadata: { owner: 'me' },
        network: { allowPublicTraffic: false },
        lifecycle: { onTimeout: 'pause' },
      });

      expect(createMock).toHaveBeenCalledExactlyOnceWith('node-template', {
        apiKey: 'key',
        timeoutMs: 60_000,
        envs: { A: '1' },
        metadata: { owner: 'me', 'ai-sdk-sandbox-ports': '4000,3000' },
        network: { allowPublicTraffic: false },
        lifecycle: { onTimeout: 'pause' },
      });
      expect(session.ports).toEqual([4000, 3000]);
    });

    it('reads the working directory from the live sandbox', async () => {
      const { sandbox, spies } = makeMockSandbox({ workingDirectory: '/app' });
      createMock.mockResolvedValue(sandbox);

      const session = await createE2BNetworkSandboxSession();

      expect(session.defaultWorkingDirectory).toBe('/app');
      expect(spies.run).toHaveBeenCalledExactlyOnceWith('pwd', {});
    });

    it('rejects native sandbox inputs', async () => {
      await expect(
        createE2BNetworkSandboxSession({
          sandbox: makeMockSandbox().sandbox,
        } as never),
      ).rejects.toThrow('FromNativeSandbox');
      expect(createMock).not.toHaveBeenCalled();
    });

    it('rejects a sandboxId, because E2B assigns sandbox IDs', async () => {
      await expect(
        createE2BNetworkSandboxSession({ sandboxId: 'my-sandbox' } as never),
      ).rejects.toThrow('sandboxId is not supported');
      expect(createMock).not.toHaveBeenCalled();
    });

    it('rejects invalid ports before creating a sandbox', async () => {
      await expect(
        createE2BNetworkSandboxSession({ ports: [0] }),
      ).rejects.toThrow('Invalid sandbox port');
      expect(createMock).not.toHaveBeenCalled();
    });

    it('prefers abortSignal over the native signal and respects an aborted one', async () => {
      const { sandbox, spies } = makeMockSandbox();
      createMock.mockResolvedValue(sandbox);
      const signal = new AbortController().signal;
      const abortSignal = new AbortController().signal;

      await createE2BNetworkSandboxSession({ signal, abortSignal });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ signal: abortSignal }),
      );
      expect(spies.run).toHaveBeenCalledWith('pwd', { signal: abortSignal });

      createMock.mockClear();
      const controller = new AbortController();
      controller.abort();
      await expect(
        createE2BNetworkSandboxSession({ abortSignal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(createMock).not.toHaveBeenCalled();
    });

    it('maps authentication failures', async () => {
      const cause = new AuthenticationError('API key is required');
      createMock.mockRejectedValue(cause);

      const result = createE2BNetworkSandboxSession();

      await expect(result).rejects.toSatisfy(
        HarnessSandboxAuthenticationError.isInstance,
      );
      await expect(result).rejects.toMatchObject({ cause });
    });

    it('kills the sandbox when it cannot be adapted', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const failure = new Error('envd is unreachable');
      spies.run.mockRejectedValue(failure);
      createMock.mockResolvedValue(sandbox);

      await expect(createE2BNetworkSandboxSession()).rejects.toBe(failure);
      expect(spies.kill).toHaveBeenCalledOnce();
    });
  });

  describe('harness sandbox template', () => {
    const template = {
      identity: 'template-identity',
      prepare: vi.fn<HarnessV1SandboxTemplate['prepare']>(async () => {}),
    };

    it('prepares a snapshot once and creates the live sandbox from it', async () => {
      mockSnapshotPages([[]]);
      const preparation = makeMockSandbox({ sandboxId: 'sbx_prepare' });
      const live = makeMockSandbox();
      createMock
        .mockResolvedValueOnce(preparation.sandbox)
        .mockResolvedValueOnce(live.sandbox);
      template.prepare.mockImplementationOnce(async ({ session }) => {
        expect(session.description).toContain('sbx_prepare');
        expect('stop' in session).toBe(false);
      });

      const session = await createE2BNetworkSandboxSession({
        baseTemplate: 'node-template',
        ports: [4000],
        template,
      });

      const snapshotName = listSnapshotsMock.mock.calls[0][0].name;
      expect(snapshotName).toMatch(/^ai-sdk-harness-v1-[0-9a-f]{24}$/);
      expect(createMock).toHaveBeenNthCalledWith(1, 'node-template', {
        timeoutMs: THIRTY_MINUTES,
      });
      expect(template.prepare).toHaveBeenCalledOnce();
      expect(preparation.spies.createSnapshot).toHaveBeenCalledWith({
        name: snapshotName,
      });
      expect(preparation.spies.kill).toHaveBeenCalledOnce();
      expect(createMock).toHaveBeenNthCalledWith(2, 'snapshot-new', {
        timeoutMs: THIRTY_MINUTES,
        metadata: { 'ai-sdk-sandbox-ports': '4000' },
      });
      expect(session.id).toBe('sbx_harness');
      expect(live.spies.kill).not.toHaveBeenCalled();
    });

    it('reuses an existing snapshot without preparing again', async () => {
      const { sandbox } = makeMockSandbox();
      createMock.mockResolvedValue(sandbox);
      listSnapshotsMock.mockImplementation(({ name }: { name: string }) =>
        makeSnapshotPaginator([
          [
            {
              snapshotId: 'snapshot-existing',
              names: [`team/${name}:default`],
            },
          ],
        ]),
      );

      await createE2BNetworkSandboxSession({ template });

      expect(template.prepare).not.toHaveBeenCalled();
      expect(createMock).toHaveBeenCalledExactlyOnceWith('snapshot-existing', {
        timeoutMs: THIRTY_MINUTES,
        metadata: { 'ai-sdk-sandbox-ports': '' },
      });
    });

    it('names the snapshot after the template identity and the base template', async () => {
      const names = new Set<string>();
      for (const options of [
        { template },
        { template, baseTemplate: 'node-template' },
        { template: { ...template, identity: 'other-identity' } },
        { template, mcp: {} },
      ]) {
        mockSnapshotPages([
          [{ snapshotId: 'unrelated', names: ['unrelated'] }],
        ]);
        createMock.mockResolvedValue(makeMockSandbox().sandbox);
        await createE2BNetworkSandboxSession(options);
        names.add(listSnapshotsMock.mock.lastCall![0].name);
      }

      expect(names.size).toBe(4);
    });

    it('creates no live sandbox when preparation fails', async () => {
      mockSnapshotPages([[]]);
      const preparation = makeMockSandbox();
      createMock.mockResolvedValueOnce(preparation.sandbox);
      const failure = new Error('bootstrap failed');
      template.prepare.mockRejectedValueOnce(failure);

      await expect(createE2BNetworkSandboxSession({ template })).rejects.toBe(
        failure,
      );

      expect(createMock).toHaveBeenCalledOnce();
      expect(preparation.spies.kill).toHaveBeenCalledOnce();
    });
  });

  describe('resumeE2BNetworkSandboxSession', () => {
    it('reattaches by ID without creating a sandbox', async () => {
      const { sandbox, spies } = makeMockSandbox({
        metadata: { owner: 'me', 'ai-sdk-sandbox-ports': '4000,3000' },
      });
      connectMock.mockResolvedValue(sandbox);

      const session = await resumeE2BNetworkSandboxSession({
        sandboxId: 'sbx_harness',
      });

      expect(connectMock).toHaveBeenCalledExactlyOnceWith('sbx_harness', {
        timeoutMs: THIRTY_MINUTES,
      });
      expect(createMock).not.toHaveBeenCalled();
      expect(session.id).toBe('sbx_harness');
      expect(session.defaultWorkingDirectory).toBe('/home/user');
      expect(session.ports).toEqual([4000, 3000]);
      expect(
        await session.getPortEndpoint({ port: 4000, protocol: 'ws' }),
      ).toEqual({ url: 'wss://4000-sbx_harness.e2b.app' });

      await session.destroy();
      expect(spies.kill).toHaveBeenCalledOnce();
    });

    it('forwards lookup options and prefers abortSignal', async () => {
      const { sandbox, spies } = makeMockSandbox();
      connectMock.mockResolvedValue(sandbox);
      const signal = new AbortController().signal;
      const abortSignal = new AbortController().signal;

      const session = await resumeE2BNetworkSandboxSession({
        sandboxId: 'sbx_harness',
        apiKey: 'key',
        domain: 'e2b.test',
        timeoutMs: 60_000,
        onResume: 'reboot',
        signal,
        abortSignal,
      });

      expect(connectMock).toHaveBeenCalledExactlyOnceWith('sbx_harness', {
        apiKey: 'key',
        domain: 'e2b.test',
        timeoutMs: 60_000,
        onResume: 'reboot',
        signal: abortSignal,
      });
      expect(spies.getInfo).toHaveBeenCalledWith({ signal: abortSignal });
      expect(session.ports).toEqual([]);
    });

    it('rejects missing sandboxes and respects an aborted signal', async () => {
      const notFound = new SandboxNotFoundError('Paused sandbox not found');
      connectMock.mockRejectedValueOnce(notFound);

      await expect(
        resumeE2BNetworkSandboxSession({ sandboxId: 'missing' }),
      ).rejects.toBe(notFound);

      const controller = new AbortController();
      controller.abort();
      await expect(
        resumeE2BNetworkSandboxSession({
          sandboxId: 'missing',
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(connectMock).toHaveBeenCalledOnce();
      expect(createMock).not.toHaveBeenCalled();
    });

    it('maps authentication failures', async () => {
      connectMock.mockRejectedValue(new AuthenticationError('Unauthorized'));

      await expect(
        resumeE2BNetworkSandboxSession({ sandboxId: 'sbx_harness' }),
      ).rejects.toSatisfy(HarnessSandboxAuthenticationError.isInstance);
    });

    it('leaves the sandbox running when it cannot be adapted', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const failure = new Error('envd is unreachable');
      spies.run.mockRejectedValue(failure);
      connectMock.mockResolvedValue(sandbox);

      await expect(
        resumeE2BNetworkSandboxSession({ sandboxId: 'sbx_harness' }),
      ).rejects.toBe(failure);
      expect(spies.kill).not.toHaveBeenCalled();
      expect(spies.pause).not.toHaveBeenCalled();
    });
  });
});

const { createMock, connectMock, listSnapshotsMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  connectMock: vi.fn(),
  listSnapshotsMock: vi.fn(),
}));

vi.mock('e2b', async importOriginal => ({
  ...(await importOriginal<typeof E2BModule>()),
  Sandbox: {
    create: createMock,
    connect: connectMock,
    listSnapshots: listSnapshotsMock,
  },
}));

type MockSnapshot = { snapshotId: string; names: string[] };

/**
 * Mimics the `e2b` snapshot paginator: one `nextItems()` call per page.
 */
function makeSnapshotPaginator(pages: MockSnapshot[][]) {
  let index = 0;
  return {
    get hasNext() {
      return index < pages.length;
    },
    nextItems: async () => pages[index++],
  };
}

function mockSnapshotPages(pages: MockSnapshot[][]) {
  listSnapshotsMock.mockImplementation(() => makeSnapshotPaginator(pages));
}

function makeMockSandbox(
  options: {
    sandboxId?: string;
    workingDirectory?: string;
    metadata?: Record<string, string>;
  } = {},
) {
  const sandboxId = options.sandboxId ?? 'sbx_harness';
  const run = vi.fn(
    async (): Promise<unknown> => ({
      exitCode: 0,
      stdout: `${options.workingDirectory ?? '/home/user'}\n`,
      stderr: '',
    }),
  );
  const getInfo = vi.fn(async () => ({ metadata: options.metadata ?? {} }));
  const pause = vi.fn(async () => true);
  const kill = vi.fn(async () => true);
  const createSnapshot = vi.fn(async () => ({
    snapshotId: 'snapshot-new',
    names: [],
  }));
  const sandbox = {
    sandboxId,
    commands: { run },
    getHost: (port: number) => `${port}-${sandboxId}.e2b.app`,
    getInfo,
    pause,
    kill,
    createSnapshot,
  } as unknown as Sandbox;
  return { sandbox, spies: { run, getInfo, pause, kill, createSnapshot } };
}
