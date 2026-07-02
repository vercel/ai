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

// Per-test scenario for the fake exec WebSocket.
let execMessages: FakeMessage[] = [];
let execEmitError: string | null = null; // fire onerror after messages
let execErrorBeforeOpen = false; // connect failure: error + close, no messages
let execStayOpen = false; // do not auto-close (caller must kill())
let lastWsUrl = '';
let lastWsHeaders: Record<string, string> | undefined;

class FakeWebSocket {
  static emitted: Promise<void> = Promise.resolve();
  binaryType = 'blob';
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror:
    | ((ev: { message?: string; error?: { message?: string } }) => void)
    | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(url: string, opts?: { headers?: Record<string, string> }) {
    lastWsUrl = url;
    lastWsHeaders = opts?.headers;
    let done!: () => void;
    FakeWebSocket.emitted = new Promise<void>(r => {
      done = r;
    });
    // Defer so the client can assign handlers first.
    setTimeout(() => {
      if (execErrorBeforeOpen) {
        this.onerror?.({ message: 'connect refused' });
        this.onclose?.({ code: 1006, reason: '' });
        done();
        return;
      }
      this.onopen?.({});
      for (const message of execMessages) this.onmessage?.({ data: message });
      if (execEmitError != null) this.onerror?.({ message: execEmitError });
      if (!execStayOpen) this.onclose?.({ code: 1000, reason: '' });
      done();
    }, 0);
  }

  send(): void {}
  close(): void {
    this.onclose?.({ code: 1000, reason: '' });
  }
}

beforeEach(() => {
  execMessages = [];
  execEmitError = null;
  execErrorBeforeOpen = false;
  execStayOpen = false;
  lastWsUrl = '';
  lastWsHeaders = undefined;
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

  it('reads the exit code from a JSON-only exit frame (no binary 0x03)', async () => {
    // Reproduces the microtask race: exit delivered only as JSON, then close.
    execMessages = [
      frame(1, 'out\n'),
      JSON.stringify({ type: 'exit', exit_code: 5 }),
    ];
    const session = makeSession();
    const result = await session.run({ command: 'do-it' });
    expect(result.stdout).toBe('out\n');
    expect(result.exitCode).toBe(5);
  });

  it('attributes a fast_path merged frame (instant command) to stdout', async () => {
    // The Sprites fast_path replays an instant command's output as one 0x01
    // frame, merging stderr into stdout. Pin that documented behavior.
    execMessages = [frame(1, 'ERR\nOUT\n'), frame(3, [0])];
    const session = makeSession();
    const result = await session.run({ command: 'echo OUT; echo ERR >&2' });
    expect(result.stdout).toBe('ERR\nOUT\n');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('throws on an abnormal close with no exit frame (no false exit 0)', async () => {
    execMessages = [frame(1, 'partial')];
    execEmitError = null; // clean-looking close, but no exit was ever reported
    const session = makeSession();
    await expect(session.run({ command: 'crash' })).rejects.toThrow(
      /closed before the process reported an exit/i,
    );
  });

  it('throws when the WebSocket errors before opening', async () => {
    execErrorBeforeOpen = true;
    const session = makeSession();
    await expect(session.run({ command: 'x' })).rejects.toThrow(
      /WebSocket error/i,
    );
  });

  it('does not leak the env query string into connection errors', async () => {
    // env now triggers a temp-file write before the WS connects; stub it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    execErrorBeforeOpen = true;
    const session = makeSession();
    const err = await session
      .run({ command: 'x', env: { SECRET: 'topsecret' } })
      .catch((e: Error) => e);
    expect(String(err)).not.toContain('topsecret');
    expect(String(err)).not.toContain('SECRET=');
    // And it is never in the connection URL either.
    expect(lastWsUrl).not.toContain('topsecret');
  });

  it('ignores interleaved text frames and unknown JSON types (no stdout corruption)', async () => {
    // The live server interleaves JSON text frames (session_created,
    // session_info, unknown future types) with the binary 0x01/0x02/0x03
    // frames. Only binary frames feed stdout/stderr; text frames must never
    // leak into the streams.
    execMessages = [
      JSON.stringify({ type: 'session_created', session_id: '1' }),
      frame(1, 'hel'),
      JSON.stringify({ type: 'session_info', session_id: '1' }),
      'not json at all',
      frame(1, 'lo\n'),
      JSON.stringify({ type: 'something_unknown', foo: 'bar' }),
      JSON.stringify({ type: 'exit', exit_code: 0 }),
      frame(3, [0]),
    ];
    const session = makeSession();
    const result = await session.run({ command: 'x' });
    expect(result.stdout).toBe('hello\n');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('defaults the working directory to the session base when none is given', async () => {
    execMessages = [frame(3, [0])];
    const session = makeSession();
    await session.run({ command: 'pwd' });
    expect(new URL(lastWsUrl).searchParams.get('dir')).toBe('/home/sprite');
  });

  it('passes argv as bash -c plus cwd and the auth header (no env)', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    execMessages = [frame(3, [0])];
    const session = makeSession();
    await session.run({ command: 'echo hi', workingDirectory: '/tmp' });
    const url = new URL(lastWsUrl);
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe('/v1/sprites/my-sprite/exec');
    expect(url.searchParams.getAll('cmd')).toEqual(['bash', '-c', 'echo hi']);
    expect(url.searchParams.get('dir')).toBe('/tmp');
    // No env param, and — critically — no extra fs round-trip when env absent.
    expect(url.searchParams.has('env')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastWsHeaders?.authorization).toBe('Bearer tok');
  });

  it('routes env through a sourced temp file, never the WS query string', async () => {
    const writes: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      writes.push({ url, body: init?.body });
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    execMessages = [frame(3, [0])];
    const session = makeSession();
    await session.run({
      command: 'echo hi',
      env: { SECRET: 'top secret', FOO: 'bar' },
    });

    const url = new URL(lastWsUrl);
    // No env values anywhere on the handshake URL (the whole point).
    expect(url.searchParams.getAll('env')).toEqual([]);
    expect(lastWsUrl).not.toContain('SECRET');
    expect(lastWsUrl).not.toContain('secret');
    expect(lastWsUrl).not.toContain('bar');

    // Env written to a random /tmp file via fs/write.
    const write = writes.find(w => w.url.includes('/fs/write'));
    expect(write).toBeDefined();
    const path = new URL(write!.url).searchParams.get('path');
    expect(path).toMatch(/^\/tmp\/\.ai-sdk-env-[0-9a-f-]+$/);
    const body = new TextDecoder().decode(write!.body as Uint8Array);
    expect(body).toBe("SECRET='top secret'\nFOO='bar'\n");

    // Wrapper sources then removes the file before exec-ing the original argv.
    const cmd = url.searchParams.getAll('cmd');
    expect(cmd[0]).toBe('bash');
    expect(cmd[1]).toBe('-c');
    expect(cmd[2]).toMatch(
      /^set -a; \. '\/tmp\/\.ai-sdk-env-[0-9a-f-]+'; set \+a; rm -f '\/tmp\/\.ai-sdk-env-[0-9a-f-]+'; exec "\$@"$/,
    );
    // rm precedes exec of the payload, so a crash leaves no secret file.
    const script = cmd[2];
    expect(script.indexOf('rm -f')).toBeLessThan(script.indexOf('exec'));
    // Original argv preserved verbatim as positional args after the $0 label.
    expect(cmd.slice(3)).toEqual([
      'ai-sdk-env-wrapper',
      'bash',
      '-c',
      'echo hi',
    ]);
  });

  it('single-quote-escapes env values so the sourced file is injection-safe', async () => {
    const writes: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      writes.push({ url, body: init?.body });
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    execMessages = [frame(3, [0])];
    const session = makeSession();
    await session.run({
      command: 'echo hi',
      env: { EVIL: `a'; rm -rf /; echo '` },
    });
    const write = writes.find(w => w.url.includes('/fs/write'));
    const body = new TextDecoder().decode(write!.body as Uint8Array);
    // Each `'` becomes the literal close-escape-reopen sequence `'\''`.
    expect(body).toBe(`EVIL='a'\\''; rm -rf /; echo '\\'''\n`);
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

  it('kill() calls the kill endpoint with the parsed session id', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    execMessages = [
      JSON.stringify({ type: 'session_info', session_id: '906' }),
    ];
    execStayOpen = true; // process is "running" until killed

    const session = makeSession();
    const proc = await session.spawn({ command: 'sleep 100' });
    await FakeWebSocket.emitted; // session_info delivered + parsed
    await proc.kill();

    const killCall = fetchMock.mock.calls.find(([u]) =>
      u.endsWith('/exec/906/kill'),
    );
    expect(killCall).toBeDefined();
    expect(killCall?.[1]?.method).toBe('POST');
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
      'https://api.test/v1/sprites/my-sprite/fs/write?path=%2Fhome%2Fsprite%2Fnotes%2Fa.txt&workingDir=%2F',
    );
    expect(requestInit.method).toBe('PUT');
    expect((requestInit.headers as Record<string, string>).authorization).toBe(
      'Bearer tok',
    );
  });

  it('writeFile drains a multi-chunk stream into the request body', async () => {
    let received: ArrayBuffer | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      received = init?.body as ArrayBuffer;
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('ab'));
        controller.enqueue(new TextEncoder().encode('cd'));
        controller.close();
      },
    });
    await session.writeFile({ path: '/x.bin', content: stream });
    expect(received).toBeDefined();
    expect(new TextDecoder().decode(received)).toBe('abcd');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PUT');
  });

  it('writeFile rejects and stops draining when aborted mid-stream', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession();
    const controller = new AbortController();
    // A source that never enqueues or closes, reproducing a hung upstream.
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        // never resolves
      },
    });
    const result = session.writeFile({
      path: '/x.bin',
      content: stream,
      abortSignal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toThrow(/aborted/i);
    // The write endpoint is never reached: draining failed before the request.
    expect(fetchMock).not.toHaveBeenCalled();
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
      'https://api.test/v1/sprites/my-sprite/fs/read?path=%2Fhome%2Fsprite%2Flines.txt&workingDir=%2F',
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

  it('readBinaryFile returns the raw bytes', async () => {
    const fetchMock = vi.fn(
      async () => new Response('streamed', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession();
    const bytes = await session.readBinaryFile({ path: '/abs.txt' });
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes as Uint8Array)).toBe('streamed');
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
