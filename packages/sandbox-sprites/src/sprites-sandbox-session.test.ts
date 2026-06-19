import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpritesApiClient } from './sprites-api-client';
import { SpritesSandboxSession } from './sprites-sandbox-session';

const decoder = new TextDecoder();

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

/** Encode a `[type][payload]` exec frame as an ArrayBuffer (binaryType='arraybuffer'). */
function frame(type: number, payload: string | number[]): ArrayBuffer {
  const body =
    typeof payload === 'string'
      ? [...new TextEncoder().encode(payload)]
      : payload;
  return new Uint8Array([type, ...body]).buffer;
}

type FakeMessage = string | ArrayBuffer;

/** Per-test script of messages the fake exec WebSocket emits, in order. */
let execMessages: FakeMessage[] = [];
let lastWsUrl = '';
let lastWsHeaders: Record<string, string> | undefined;
let killCalls: string[] = [];

class FakeWebSocket {
  binaryType = 'blob';
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(url: string, opts?: { headers?: Record<string, string> }) {
    lastWsUrl = url;
    lastWsHeaders = opts?.headers;
    // Defer so the client can assign event handlers first.
    setTimeout(() => {
      this.onopen?.({});
      for (const message of execMessages) {
        this.onmessage?.({ data: message });
      }
      this.onclose?.({ code: 1000, reason: '' });
    }, 0);
  }

  send(): void {}
  close(): void {}
}

beforeEach(() => {
  execMessages = [];
  lastWsUrl = '';
  lastWsHeaders = undefined;
  killCalls = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeSession(): SpritesSandboxSession {
  const client = new SpritesApiClient({
    apiKey: 'tok',
    baseUrl: 'https://api.test',
  });
  return new SpritesSandboxSession(
    client,
    'my-sprite',
    'https://my-sprite-x.sprites.app',
    '/home/sprite',
  );
}

describe('SpritesSandboxSession.run', () => {
  it('separates stdout/stderr and returns the exit code', async () => {
    execMessages = [
      JSON.stringify({ type: 'session_info', session_id: '42' }),
      frame(1, 'hello\n'),
      frame(2, 'oops\n'),
      JSON.stringify({ type: 'exit', exit_code: 3 }),
      frame(3, [3]),
    ];
    const session = makeSession();
    const result = await session.run({ command: 'echo hello' });
    expect(result.stdout).toBe('hello\n');
    expect(result.stderr).toBe('oops\n');
    expect(result.exitCode).toBe(3);
  });

  it('passes argv as bash -c, plus cwd and env, in the WS query and auth header', async () => {
    execMessages = [frame(3, [0])];
    const session = makeSession();
    await session.run({
      command: 'echo hi',
      workingDirectory: '/tmp',
      env: { FOO: 'bar' },
    });
    const url = new URL(lastWsUrl);
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe('/v1/sprites/my-sprite/exec');
    expect(url.searchParams.getAll('cmd')).toEqual(['bash', '-c', 'echo hi']);
    expect(url.searchParams.get('dir')).toBe('/tmp');
    expect(url.searchParams.get('env')).toBe('FOO=bar');
    expect(lastWsHeaders?.authorization).toBe('Bearer tok');
  });

  it('throws synchronously when already aborted', async () => {
    const session = makeSession();
    const controller = new AbortController();
    controller.abort();
    await expect(
      session.run({ command: 'echo hi', abortSignal: controller.signal }),
    ).rejects.toThrow();
  });
});

describe('SpritesSandboxSession.spawn', () => {
  it('streams stdout and resolves wait() with the exit code', async () => {
    execMessages = [
      frame(1, 'one\n'),
      frame(1, 'two\n'),
      JSON.stringify({ type: 'exit', exit_code: 0 }),
      frame(3, [0]),
    ];
    const session = makeSession();
    const proc = await session.spawn({ command: 'run-it' });
    const out = await collect(proc.stdout);
    const { exitCode } = await proc.wait();
    expect(out).toBe('one\ntwo\n');
    expect(exitCode).toBe(0);
  });
});

describe('SpritesSandboxSession filesystem', () => {
  it('writeTextFile PUTs to fs/write with the resolved path', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession();
    await session.writeTextFile({ path: 'notes/a.txt', content: 'hi' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    const requestInit = init as RequestInit;
    expect(url).toBe(
      'https://api.test/v1/sprites/my-sprite/fs/write?path=%2Fhome%2Fsprite%2Fnotes%2Fa.txt',
    );
    expect(requestInit.method).toBe('PUT');
    expect((requestInit.headers as Record<string, string>).authorization).toBe(
      'Bearer tok',
    );
  });

  it('readTextFile decodes content and applies a line range', async () => {
    const fetchMock = vi.fn(
      async (_url: string) => new Response('a\nb\nc\nd', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession();
    const text = await session.readTextFile({
      path: 'lines.txt',
      startLine: 2,
      endLine: 3,
    });
    expect(text).toBe('b\nc');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://api.test/v1/sprites/my-sprite/fs/read?path=%2Fhome%2Fsprite%2Flines.txt',
    );
  });

  it('readTextFile returns null for a missing file (404)', async () => {
    const fetchMock = vi.fn(
      async () => new Response('{"error":"no such file"}', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession();
    expect(await session.readTextFile({ path: '/nope.txt' })).toBeNull();
  });

  it('readFile returns a stream of the bytes', async () => {
    const fetchMock = vi.fn(
      async () => new Response('streamed', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession();
    const stream = await session.readFile({ path: '/abs.txt' });
    expect(stream).not.toBeNull();
    expect(await collect(stream as ReadableStream<Uint8Array>)).toBe(
      'streamed',
    );
  });
});
