import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import type * as HarnessUtils from '@ai-sdk/harness/utils';
import type { Experimental_SandboxProcess } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJcode } from './jcode-harness';

const mocks = vi.hoisted(() => ({
  socketUrls: [] as string[],
}));

vi.mock('@ai-sdk/harness/utils', async importOriginal => {
  const actual = await importOriginal<typeof HarnessUtils>();
  return {
    ...actual,
    SandboxChannel: class {
      private socket: { close(): void } | undefined;
      constructor(
        private readonly options: {
          connect: () => Promise<{ close(): void }>;
        },
      ) {}
      async open() {
        this.socket = await this.options.connect();
      }
      on() {
        return () => {};
      }
      onClose() {}
      beginClose() {}
      isClosed() {
        return false;
      }
      send() {}
      close() {
        this.socket?.close();
      }
    },
  };
});

vi.mock('ws', () => ({
  WebSocket: class {
    private readonly listeners = new Map<
      string,
      (...args: unknown[]) => void
    >();
    constructor(url: string) {
      mocks.socketUrls.push(url);
      queueMicrotask(() => this.listeners.get('open')?.());
    }
    once(type: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(type, listener);
    }
    close() {}
  },
}));

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text) controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function networkSandbox({
  stdout = '{"type":"bridge-ready","port":4319}\n',
  stderr = '',
  exitCode = 0,
  runs = [],
  spawns = [],
  spawnEnvs = [],
  endpoint = { url: 'ws://sandbox.example/bridge?existing=1' },
}: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  runs?: string[];
  spawns?: string[];
  spawnEnvs?: Array<Record<string, string | undefined>>;
  endpoint?: { url: string; headers?: Readonly<Record<string, string>> };
} = {}): HarnessV1NetworkSandboxSession {
  const proc = {
    stdout: textStream(stdout),
    stderr: textStream(stderr),
    wait: async () => ({ exitCode }),
    kill: async () => {},
  } as Experimental_SandboxProcess;
  const restricted = {
    run: async ({ command }: { command: string }) => {
      runs.push(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    readTextFile: async () => null,
    writeTextFile: async () => {},
    spawn: async ({
      command,
      env,
    }: {
      command: string;
      env?: Record<string, string | undefined>;
    }) => {
      spawns.push(command);
      if (env) spawnEnvs.push(env);
      return proc;
    },
  };
  return {
    id: 'sandbox-1',
    defaultWorkingDirectory: '/sandbox',
    restricted: () => restricted,
    ports: [4319],
    getPortEndpoint: vi.fn(async () => endpoint),
    getPortUrl: vi.fn(async () => endpoint.url),
    stop: async () => {},
    ...restricted,
  } as unknown as HarnessV1NetworkSandboxSession;
}

describe('createJcode', () => {
  beforeEach(() => {
    mocks.socketUrls.length = 0;
  });

  it('declares the foundational HarnessV1 capabilities honestly', () => {
    expect(createJcode()).toMatchObject({
      specificationVersion: 'harness-v1',
      harnessId: 'jcode',
      builtinTools: {},
      supportsBuiltinToolApprovals: false,
      supportsBuiltinToolFiltering: false,
      getBootstrap: expect.any(Function),
    });
  });

  it('starts the bridge with quoted paths, transformed env, endpoint, and token', async () => {
    const runs: string[] = [];
    const spawns: string[] = [];
    const spawnEnvs: Array<Record<string, string | undefined>> = [];
    const sandbox = networkSandbox({ runs, spawns, spawnEnvs });
    const harness = createJcode({
      env: { API_KEY: 'secret' },
      jcodeHome: "/custom/jcode home's",
      mintBridgeToken: id => `token-${id}`,
    });

    const session = await harness.doStart({
      sessionId: 's1; unsafe',
      sandboxSession: sandbox,
      sessionWorkDir: "/sandbox/work dir's",
    });

    expect(runs[0]).toBe(
      "mkdir -p '/sandbox/work dir'\\''s' '/sandbox/.agent-runs/s1; unsafe/bridge' '/custom/jcode home'\\''s'",
    );
    expect(spawns).toEqual([
      "node '/sandbox/.harness-bootstrap/jcode/bridge.mjs' --workdir '/sandbox/work dir'\\''s' --bridge-state-dir '/sandbox/.agent-runs/s1; unsafe/bridge' --jcode-home '/custom/jcode home'\\''s'",
    ]);
    expect(spawnEnvs).toEqual([
      {
        API_KEY: 'secret',
        BRIDGE_CHANNEL_TOKEN: 'token-sandbox-1',
        BRIDGE_WS_PORT: '4319',
      },
    ]);
    expect(sandbox.getPortEndpoint).toHaveBeenCalledWith({
      port: 4319,
      protocol: 'ws',
    });
    expect(mocks.socketUrls).toEqual([
      'ws://sandbox.example/bridge?existing=1&token=token-sandbox-1',
    ]);
    expect(session.sessionId).toBe('s1; unsafe');
  });

  it('includes bridge output and exit status when startup fails', async () => {
    const harness = createJcode({ startupTimeoutMs: 50 });
    let error: Error | undefined;
    try {
      await harness.doStart({
        sessionId: 'failed',
        sandboxSession: networkSandbox({
          stdout: 'bridge diagnostic\n',
          stderr: 'fatal detail\n',
          exitCode: 23,
        }),
        sessionWorkDir: '/sandbox/work',
      });
    } catch (cause) {
      error = cause as Error;
    }

    expect(error?.message).toContain(
      'jcode bridge exited before becoming ready.',
    );
    expect(error?.message).toContain('bridge diagnostic');
    expect(error?.message).toContain('fatal detail');
    expect(error?.message).toContain('23');
  });

  it.each([
    {
      name: 'basic sandbox without explicit networking',
      harness: createJcode(),
      sandboxSession: {} as never,
      expected: 'explicit `port` and `portEndpoint`',
    },
    {
      name: 'network sandbox without an exposed port',
      harness: createJcode(),
      sandboxSession: { ...networkSandbox(), ports: [] },
      expected: 'a TCP port must be exposed',
    },
    {
      name: 'token factory with an id-less basic sandbox',
      harness: createJcode({
        port: 4319,
        portEndpoint: { url: 'ws://localhost:4319' },
        mintBridgeToken: () => 'token',
      }),
      sandboxSession: {
        restricted: () => ({}),
      } as never,
      expected:
        '`mintBridgeToken` requires a sandbox session that exposes an id',
    },
  ])('rejects $name', async ({ harness, sandboxSession, expected }) => {
    await expect(
      harness.doStart({
        sessionId: 'test',
        sandboxSession,
        sessionWorkDir: '/workspace',
      }),
    ).rejects.toThrow(expected);
  });

  it('rejects malformed resume state and unsupported continuation before launch', async () => {
    const clientFactory = vi.fn();
    const harness = createJcode({
      experimentalHostExecution: true,
      clientFactory,
    });
    const base = {
      sessionId: 'test',
      sandboxSession: {} as never,
      sessionWorkDir: '/workspace',
    };

    await expect(
      harness.doStart({
        ...base,
        resumeFrom: {
          type: 'resume-session',
          specificationVersion: 'harness-v1',
          harnessId: 'jcode',
          data: { jcodeSessionId: 42 },
        },
      }),
    ).rejects.toThrow();
    await expect(
      harness.doStart({
        ...base,
        continueFrom: {
          type: 'continue-turn',
          specificationVersion: 'harness-v1',
          harnessId: 'jcode',
          data: {},
        } as never,
      }),
    ).rejects.toThrow('turn continuation is not supported yet');
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('transforms host launch options and resume state without mutating env', async () => {
    const env = { API_KEY: 'secret' };
    const client = {
      instanceHome: '/resumed/home',
      supports: vi.fn(() => true),
      attachSession: vi.fn(async () => ({ session_id: 'native-1' })),
      createSession: vi.fn(),
      detachSession: vi.fn(),
      sendMessage: vi.fn(),
      cancel: vi.fn(),
      softInterrupt: vi.fn(),
      compact: vi.fn(),
      setModel: vi.fn(),
      setReasoningEffort: vi.fn(),
      setExternalTools: vi.fn(),
      submitExternalToolResult: vi.fn(),
      events: vi.fn(() => (async function* () {})()),
      close: vi.fn(),
    };
    const clientFactory = vi.fn(async () => client);
    const harness = createJcode({
      experimentalHostExecution: true,
      env,
      jcodeHome: '/configured/home',
      binary: '/bin/jcode',
      inheritLogins: false,
      inheritStderr: true,
      startupTimeoutMs: 1234,
      clientFactory,
    });

    const session = await harness.doStart({
      sessionId: 'test',
      sandboxSession: {} as never,
      sessionWorkDir: '/workspace',
      resumeFrom: {
        type: 'resume-session',
        specificationVersion: 'harness-v1',
        harnessId: 'jcode',
        data: { jcodeSessionId: 'native-1', jcodeHome: '/resumed/home' },
      },
    });

    expect(clientFactory).toHaveBeenCalledWith({
      workingDir: '/workspace',
      jcodeHome: '/resumed/home',
      inheritLogins: false,
      binary: '/bin/jcode',
      env: { API_KEY: 'secret' },
      startupTimeoutMs: 1234,
      inheritStderr: true,
      clientName: expect.stringMatching(/^ai-sdk\/harness-jcode\//),
    });
    expect(env).toEqual({ API_KEY: 'secret' });
    expect(client.attachSession).toHaveBeenCalledWith('native-1');
    expect(session.isResume).toBe(true);
  });
});
