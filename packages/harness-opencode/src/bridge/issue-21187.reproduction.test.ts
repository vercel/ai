import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  start: undefined as unknown,
  turn: undefined as unknown,
}));

const sdkMock = vi.hoisted(() => ({
  client: undefined as unknown,
}));

const permissionReplyMock = vi.hoisted(() => vi.fn());
const createOpencodeServerMock = vi.hoisted(() =>
  vi.fn(async (_options: Record<string, unknown>) => ({
    url: 'http://127.0.0.1:4096',
    close: vi.fn(),
  })),
);

vi.mock('@ai-sdk/harness/bridge', () => ({
  runBridge: vi.fn(
    async (options: {
      onStart(start: unknown, turn: unknown): Promise<void>;
    }) => {
      await options.onStart(bridgeMock.start, bridgeMock.turn);
      return { close: vi.fn() };
    },
  ),
}));

vi.mock('@opencode-ai/sdk/v2', () => ({
  createOpencodeServer: createOpencodeServerMock,
  createOpencodeClient: vi.fn(() => sdkMock.client),
}));

vi.mock('./tool-relay', () => ({
  startAuthorizedToolRelay: vi.fn(async () => ({
    authorizeToolCall: vi.fn(),
    close: vi.fn(),
    port: 4097,
  })),
}));

vi.mock('./opencode-path', () => ({
  prependOpenCodeBinToPath: vi.fn(),
}));

const originalArgv = [...process.argv];
let tempDirectory: string | undefined;

afterEach(() => {
  process.argv.length = 0;
  process.argv.push(...originalArgv);
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = undefined;
  vi.resetModules();
});

it('allows external directory access when permissionMode is allow-all', async () => {
  tempDirectory = mkdtempSync(path.join(tmpdir(), 'issue-21187-'));
  const realWorkdir = path.join(tempDirectory, 'real-workdir');
  const linkedWorkdir = path.join(tempDirectory, 'linked-workdir');
  mkdirSync(realWorkdir);
  symlinkSync(realWorkdir, linkedWorkdir, 'dir');

  process.argv.length = 0;
  process.argv.push(
    process.execPath,
    'opencode-bridge',
    '--workdir',
    linkedWorkdir,
    '--bridge-state-dir',
    path.join(tempDirectory, 'bridge-state'),
    '--bootstrap-dir',
    path.join(tempDirectory, 'bootstrap'),
  );

  bridgeMock.start = {
    type: 'start',
    operation: 'prompt',
    prompt: 'Create /workspace/other/.state.',
    permissionMode: 'allow-all',
    openCodeConfig: {
      permission: {
        external_directory: 'allow',
      },
    },
  };
  bridgeMock.turn = {
    emit: vi.fn(),
    requestToolResult: vi.fn(),
    requestToolApproval: vi.fn(),
    experimental_userMessages: {
      pendingCount: 0,
      close: vi.fn(),
      async *[Symbol.asyncIterator]() {},
    },
    abortSignal: new AbortController().signal,
    firstTurn: true,
    bridgeLog: vi.fn(),
    emitWarning: vi.fn(),
    emitError: vi.fn(),
  };

  sdkMock.client = {
    mcp: { status: vi.fn(async () => ({ data: {} })) },
    session: {
      create: vi.fn(async () => ({ data: { id: 'session-1' } })),
      get: vi.fn(async () => ({ data: {} })),
      messages: vi.fn(async () => ({ data: [] })),
      promptAsync: vi.fn(async () => ({ data: {} })),
    },
    event: {
      subscribe: vi.fn(async () => ({
        stream: {
          async *[Symbol.asyncIterator]() {
            yield {
              type: 'permission.v2.asked',
              properties: {
                id: 'external-request',
                sessionID: 'session-1',
                action: 'external_directory',
                resources: ['/workspace/other/.state'],
                source: { callID: 'bash-call' },
              },
            };
            yield {
              type: 'permission.v2.asked',
              properties: {
                id: 'symlink-request',
                sessionID: 'session-1',
                action: 'read',
                resources: [path.join(realWorkdir, 'inside.txt')],
                source: { callID: 'read-call' },
              },
            };
            yield {
              type: 'session.next.step.failed',
              properties: {
                sessionID: 'session-1',
                error: 'end reproduction turn',
              },
            };
          },
        },
      })),
    },
    v2: {
      session: {
        context: vi.fn(async () => ({ data: [] })),
        permission: { reply: permissionReplyMock },
        switchModel: vi.fn(async () => ({ data: {} })),
      },
    },
  };

  await import('./index');

  expect(permissionReplyMock).toHaveBeenCalledTimes(2);

  const externalReply = permissionReplyMock.mock.calls[0]?.[0] as
    | { reply?: string; message?: string }
    | undefined;
  const symlinkReply = permissionReplyMock.mock.calls[1]?.[0] as
    | { reply?: string; message?: string }
    | undefined;
  const serverConfig = createOpencodeServerMock.mock.calls[0]?.[0]?.config as
    | { permission?: { external_directory?: string } }
    | undefined;

  console.log(
    `seeded external_directory config became: ${serverConfig?.permission?.external_directory}`,
  );
  console.log(
    `symlink-backed in-workdir resource reply: ${symlinkReply?.reply}`,
  );

  if (
    externalReply?.reply === 'reject' &&
    externalReply.message === 'External directory access rejected.'
  ) {
    throw new Error(
      'ISSUE #21187 REPRODUCED: permissionMode "allow-all" rejected external directory access.',
    );
  }

  expect(externalReply).toMatchObject({
    reply: 'always',
  });
});
