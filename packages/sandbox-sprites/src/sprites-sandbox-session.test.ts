import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Experimental_SandboxProcess as SandboxProcess } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpritesApiClient, type SpriteExecOptions } from './sprites-api-client';
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
  static last: FakeWebSocket | undefined;
  binaryType = 'blob';
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror:
    | ((ev: { message?: string; error?: { message?: string } }) => void)
    | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  sent: Array<string | Uint8Array> = [];
  isOpen = false;

  constructor(url: string, opts?: { headers?: Record<string, string> }) {
    FakeWebSocket.last = this;
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
      this.isOpen = true;
      this.onopen?.({});
      for (const message of execMessages) this.onmessage?.({ data: message });
      if (execEmitError != null) this.onerror?.({ message: execEmitError });
      if (!execStayOpen) this.onclose?.({ code: 1000, reason: '' });
      done();
    }, 0);
  }

  // Like a real socket, throw on a send that comes before the socket is open.
  send(data: string | Uint8Array): void {
    if (!this.isOpen) throw new Error('InvalidStateError: still connecting');
    this.sent.push(data);
  }
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

  it('reports the error frame of a session whose output was not retained', async () => {
    // Recorded from a live Sprite for a command that printed 131,072 bytes
    // before the exec socket attached: the server replays at most the last
    // 64 KiB, sends this error frame and closes normally without an exit.
    execMessages = [
      JSON.stringify({
        msg: 'session_created cmd=bash',
        pid: 883,
        t_ms: 25,
        type: 'debug',
      }),
      JSON.stringify({
        error:
          'cannot resume output at byte 0: earliest retained byte is 65536',
        type: 'error',
      }),
    ];

    const error = await makeSession()
      .run({ command: "head -c 131072 /dev/zero | tr '\\0' a" })
      .catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Sprites exec failed: cannot resume output at byte 0: earliest retained byte is 65536 (wss://api.test/v1/sprites/my-sprite/exec).',
    );
  });

  it('lets a reported exit win over an error frame', async () => {
    execMessages = [
      JSON.stringify({ type: 'error', error: 'late' }),
      frame(1, 'out'),
      frame(3, [0]),
    ];

    await expect(makeSession().run({ command: 'x' })).resolves.toEqual({
      exitCode: 0,
      stdout: 'out',
      stderr: '',
    });
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

  it.each(['MY-VAR', 'A=1;touch /tmp/pwn;B', '1ABC', ''])(
    'rejects the env name %j without writing a file or connecting',
    async key => {
      const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const session = makeSession();

      await expect(
        session.run({ command: 'echo hi', env: { OK: 'x', [key]: 'y' } }),
      ).rejects.toThrow(`Invalid environment variable name "${key}"`);
      await expect(
        session.spawn({ command: 'echo hi', env: { [key]: 'y' } }),
      ).rejects.toThrow(`Invalid environment variable name "${key}"`);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(lastWsUrl).toBe('');
    },
  );

  it('throws synchronously when already aborted', async () => {
    const session = makeSession();
    const controller = new AbortController();
    controller.abort();
    await expect(
      session.run({ command: 'echo hi', abortSignal: controller.signal }),
    ).rejects.toThrow();
  });
});

describe('SpritesSandboxSession.run with maxOutputLength', () => {
  it('returns capped prefixes and the full lengths', async () => {
    execMessages = [
      frame(1, '1\n2\n'),
      frame(2, 'error'),
      frame(1, '3\n'),
      frame(3, [7]),
    ];

    await expect(
      makeSession().run({ command: 'x', maxOutputLength: 4 }),
    ).resolves.toEqual({
      exitCode: 7,
      stdout: '1\n2\n',
      stderr: 'erro',
      stdoutLength: 6,
      stderrLength: 5,
    });
  });

  it('counts UTF-16 code units', async () => {
    execMessages = [frame(1, 'a😀b'), frame(3, [0])];

    await expect(
      makeSession().run({ command: 'x', maxOutputLength: 2 }),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: 'a\ud83d',
      stderr: '',
      stdoutLength: 4,
      stderrLength: 0,
    });
  });

  it('returns no lengths without the option', async () => {
    execMessages = [frame(1, 'out'), frame(3, [0])];

    await expect(makeSession().run({ command: 'x' })).resolves.toEqual({
      exitCode: 0,
      stdout: 'out',
      stderr: '',
    });
  });

  it('rejects an invalid limit before starting the command', async () => {
    await expect(
      makeSession().run({ command: 'x', maxOutputLength: 0 }),
    ).rejects.toThrow('Must be a positive safe integer.');
    expect(lastWsUrl).toBe('');
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

  it.each([
    { stream: 'stdout', frameType: 1 },
    { stream: 'stderr', frameType: 2 },
  ] as const)(
    'skips a cancelled $stream and still resolves wait()',
    async ({ stream, frameType }) => {
      execStayOpen = true;
      const session = makeSession();
      const proc = await session.spawn({ command: 'run-it' });
      await FakeWebSocket.emitted;
      const socket = FakeWebSocket.last;
      const other = stream === 'stdout' ? proc.stderr : proc.stdout;

      await proc[stream].cancel();
      expect(() =>
        socket?.onmessage?.({ data: frame(frameType, 'late\n') }),
      ).not.toThrow();
      socket?.onmessage?.({ data: frame(3, [0]) });
      expect(() => socket?.onclose?.({ code: 1000, reason: '' })).not.toThrow();

      expect(await proc.wait()).toEqual({ exitCode: 0 });
      expect(await collect(other)).toBe('');
    },
  );

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

function execParams(): URLSearchParams {
  return new URL(lastWsUrl).searchParams;
}

describe('SpritesSandboxSession.spawn with stdin', () => {
  it('sends input and EOF as exec frames, waiting for the socket to open', async () => {
    execStayOpen = true;
    const proc = await makeSession().spawn({ command: 'cat', stdin: true });

    expect(execParams().get('stdin')).toBe('true');

    const writer = proc.stdin.getWriter();
    await writer.write(new Uint8Array([104, 105]));
    await writer.close();

    expect(FakeWebSocket.last?.sent).toEqual([
      Uint8Array.of(0, 104, 105),
      Uint8Array.of(4),
    ]);
  });

  it('keeps the process running when stdin closes', async () => {
    execStayOpen = true;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const proc = await makeSession().spawn({ command: 'cat', stdin: true });

    await proc.stdin.close();

    expect(FakeWebSocket.last?.sent).toEqual([Uint8Array.of(4)]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('delivers EOF when stdin is aborted', async () => {
    execStayOpen = true;
    const proc = await makeSession().spawn({ command: 'cat', stdin: true });

    await proc.stdin.abort();

    expect(FakeWebSocket.last?.sent).toEqual([Uint8Array.of(4)]);
  });

  it('does not send an empty input frame', async () => {
    execStayOpen = true;
    const proc = await makeSession().spawn({ command: 'cat', stdin: true });

    const writer = proc.stdin.getWriter();
    await writer.write(new Uint8Array());

    expect(FakeWebSocket.last?.sent).toEqual([]);
  });

  it('rejects a write after the process has gone and closes quietly', async () => {
    execMessages = [frame(3, [0])];
    const proc = await makeSession().spawn({ command: 'true', stdin: true });
    await proc.wait();

    await expect(
      proc.stdin.getWriter().write(new Uint8Array([1])),
    ).rejects.toThrow(/closed before stdin was written/);
  });

  it('sends no EOF after the process has gone', async () => {
    execMessages = [frame(3, [0])];
    const proc = await makeSession().spawn({ command: 'true', stdin: true });
    await proc.wait();

    await proc.stdin.close();

    expect(FakeWebSocket.last?.sent).toEqual([]);
  });

  it('rejects a write once aborted', async () => {
    execStayOpen = true;
    const controller = new AbortController();
    const proc = await makeSession().spawn({
      command: 'cat',
      stdin: true,
      abortSignal: controller.signal,
    });
    const reason = new Error('stop');
    controller.abort(reason);

    await expect(
      proc.stdin.getWriter().write(new Uint8Array([1])),
    ).rejects.toBe(reason);
  });

  it.each([{}, { stdin: false }])(
    'leaves standard input closed with %j',
    async options => {
      execMessages = [frame(3, [0])];
      const proc = await makeSession().spawn({ command: 'cat', ...options });

      expect(execParams().has('stdin')).toBe(false);
      expect(proc).not.toHaveProperty('stdin');
    },
  );
});

describe('SpritesSandboxSession relative paths', () => {
  it.each([
    ['sub', '/home/sprite/sub'],
    ['/abs', '/abs'],
  ])('resolves the run workingDirectory %s', async (workingDirectory, dir) => {
    execMessages = [frame(3, [0])];
    await makeSession().run({ command: 'pwd', workingDirectory });

    expect(execParams().get('dir')).toBe(dir);
  });

  it('resolves the spawn workingDirectory against the same base', async () => {
    execMessages = [frame(3, [0])];
    await makeSession().spawn({ command: 'pwd', workingDirectory: 'sub' });

    expect(execParams().get('dir')).toBe('/home/sprite/sub');
  });

  it('keeps `link/..` so that the sandbox follows the link', async () => {
    execMessages = [frame(3, [0])];
    await makeSession().stat({ path: 'link/../file' });

    expect(execParams().getAll('cmd').at(-1)).toBe('/home/sprite/link/../file');
  });

  it('resolves against a root working directory', async () => {
    execMessages = [frame(3, [0])];
    const client = new SpritesApiClient({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    await new SpritesSandboxSession(client, 's', 'https://s', '/').stat({
      path: 'file',
    });

    expect(execParams().getAll('cmd').at(-1)).toBe('/file');
  });
});

describe('SpritesSandboxSession.stat', () => {
  it('returns the type and size, passing the path as an argument', async () => {
    execMessages = [frame(1, 'file 12'), frame(3, [0])];

    await expect(makeSession().stat({ path: 'a b.txt' })).resolves.toEqual({
      type: 'file',
      size: 12,
    });
    expect(execParams().getAll('cmd').slice(0, 2)).toEqual(['bash', '-c']);
    expect(execParams().getAll('cmd').slice(3)).toEqual([
      'bash',
      '/home/sprite/a b.txt',
    ]);
  });

  it('resolves to null when the path does not exist', async () => {
    execMessages = [frame(3, [3])];

    await expect(makeSession().stat({ path: 'nope' })).resolves.toBeNull();
  });

  it('rejects with the message from stderr', async () => {
    execMessages = [frame(2, 'Permission denied\n'), frame(3, [1])];

    await expect(makeSession().stat({ path: 'x' })).rejects.toThrow(
      'Failed to stat x: Permission denied',
    );
  });

  it('rejects with a message Sprites replayed as stdout', async () => {
    execMessages = [frame(1, 'Permission denied\n'), frame(3, [1])];

    await expect(makeSession().stat({ path: 'x' })).rejects.toThrow(
      'Failed to stat x: Permission denied',
    );
  });
});

describe('SpritesSandboxSession.listDirectory', () => {
  it('parses names containing spaces and newlines', async () => {
    execMessages = [
      frame(1, 'file a b\0directory c\nd\0symlink e\0other f\0'),
      frame(3, [0]),
    ];

    await expect(makeSession().listDirectory({ path: '.' })).resolves.toEqual([
      { name: 'a b', type: 'file' },
      { name: 'c\nd', type: 'directory' },
      { name: 'e', type: 'symlink' },
      { name: 'f', type: 'other' },
    ]);
  });

  it('returns an empty list for an empty directory', async () => {
    execMessages = [frame(3, [0])];

    await expect(makeSession().listDirectory({ path: 'dir' })).resolves.toEqual(
      [],
    );
  });

  it('resolves to null when the directory does not exist', async () => {
    execMessages = [frame(3, [3])];

    await expect(
      makeSession().listDirectory({ path: 'nope' }),
    ).resolves.toBeNull();
  });

  it('rejects when the path is not a directory', async () => {
    execMessages = [frame(2, 'Not a directory\n'), frame(3, [4])];

    await expect(makeSession().listDirectory({ path: 'file' })).rejects.toThrow(
      'Failed to list file: Not a directory',
    );
  });
});

describe('SpritesSandboxSession.deleteFile', () => {
  it('resolves to true when the file was deleted', async () => {
    execMessages = [frame(3, [0])];

    await expect(makeSession().deleteFile({ path: 'x' })).resolves.toBe(true);
  });

  it('resolves to false when the file does not exist', async () => {
    execMessages = [frame(3, [3])];

    await expect(makeSession().deleteFile({ path: 'x' })).resolves.toBe(false);
  });

  it('rejects when the path is a directory', async () => {
    execMessages = [frame(2, 'Is a directory\n'), frame(3, [4])];

    await expect(makeSession().deleteFile({ path: 'dir' })).rejects.toThrow(
      'Cannot delete dir: it is a directory.',
    );
  });

  it('rejects on any other failure', async () => {
    execMessages = [frame(2, 'Permission denied\n'), frame(3, [1])];

    await expect(makeSession().deleteFile({ path: 'x' })).rejects.toThrow(
      'Failed to delete x: Permission denied',
    );
  });
});

// Runs the session's path scripts with the local bash instead of a Sprite, so
// the scripts themselves are tested.
function createLocalClient(directory: string): SpritesApiClient {
  return {
    exec: async (
      _name: string,
      { argv, cwd }: SpriteExecOptions,
    ): Promise<SandboxProcess> => {
      const [command, ...args] = argv;
      const result = spawnSync(command, args, {
        cwd: cwd ?? directory,
        encoding: 'utf8',
      });
      const toStream = (text: string) =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
          },
        });
      return {
        stdout: toStream(result.stdout),
        stderr: toStream(result.stderr),
        wait: async () => ({ exitCode: result.status ?? 1 }),
        kill: async () => {},
      };
    },
  } as unknown as SpritesApiClient;
}

describe('SpritesSandboxSession path methods', () => {
  let directory: string;
  let session: SpritesSandboxSession;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sprites-sandbox-session-'));
    session = new SpritesSandboxSession(
      createLocalClient(directory),
      's',
      'https://s',
      directory,
    );

    await writeFile(join(directory, 'file.txt'), 'hello');
    await mkdir(join(directory, 'dir'));
    await writeFile(join(directory, 'dir', 'nested.txt'), '');
    await writeFile(join(directory, '.hidden'), '');
    await writeFile(join(directory, 'with space\nand newline'), '');
    await symlink(join(directory, 'file.txt'), join(directory, 'file-link'));
    await symlink(join(directory, 'dir'), join(directory, 'dir-link'));
    await symlink(join(directory, 'missing'), join(directory, 'broken-link'));
    spawnSync('mkfifo', [join(directory, 'fifo')]);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  describe('stat', () => {
    it('returns the type and size of a file', async () => {
      expect(await session.stat({ path: 'file.txt' })).toEqual({
        type: 'file',
        size: 5,
      });
    });

    it('returns directory for a directory', async () => {
      expect(await session.stat({ path: join(directory, 'dir') })).toEqual({
        type: 'directory',
        size: expect.any(Number),
      });
    });

    it('follows symbolic links', async () => {
      expect(await session.stat({ path: 'file-link' })).toEqual({
        type: 'file',
        size: 5,
      });
    });

    it('returns null for a missing path', async () => {
      expect(await session.stat({ path: 'missing.txt' })).toBeNull();
      expect(await session.stat({ path: 'file.txt/child' })).toBeNull();
    });

    it('returns null for a broken symbolic link', async () => {
      expect(await session.stat({ path: 'broken-link' })).toBeNull();
    });

    it('returns other for a named pipe', async () => {
      expect(await session.stat({ path: 'fifo' })).toEqual({
        type: 'other',
        size: 0,
      });
    });

    // Root can search any directory, so the check cannot fail as root.
    it.skipIf(process.getuid?.() === 0)(
      'rejects instead of returning null when a parent directory is not searchable',
      async () => {
        await mkdir(join(directory, 'locked'));
        await writeFile(join(directory, 'locked', 'secret.txt'), '');
        await chmod(join(directory, 'locked'), 0o000);
        try {
          await expect(
            session.stat({ path: 'locked/secret.txt' }),
          ).rejects.toThrow('Permission denied');
          await expect(
            session.listDirectory({ path: 'locked/missing' }),
          ).rejects.toThrow('Permission denied');
          await expect(
            session.deleteFile({ path: 'locked/secret.txt' }),
          ).rejects.toThrow('Permission denied');
        } finally {
          await chmod(join(directory, 'locked'), 0o755);
        }
      },
    );

    it('rejects for a symbolic link loop', async () => {
      await symlink(join(directory, 'loop'), join(directory, 'loop'));
      await expect(session.stat({ path: 'loop' })).rejects.toThrow(
        'Too many levels of symbolic links',
      );
      await expect(session.listDirectory({ path: 'loop' })).rejects.toThrow(
        'Too many levels of symbolic links',
      );
    });
  });

  describe('listDirectory', () => {
    it('lists entries with their types, including hidden entries', async () => {
      const entries = await session.listDirectory({ path: '.' });

      expect(entries?.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: '.hidden', type: 'file' },
        { name: 'broken-link', type: 'symlink' },
        { name: 'dir', type: 'directory' },
        { name: 'dir-link', type: 'symlink' },
        { name: 'fifo', type: 'other' },
        { name: 'file-link', type: 'symlink' },
        { name: 'file.txt', type: 'file' },
        { name: 'with space\nand newline', type: 'file' },
      ]);
    });

    it('resolves `..` after a symbolic link in the filesystem', async () => {
      await mkdir(join(directory, 'deep', 'inner'), { recursive: true });
      await symlink(
        join(directory, 'deep', 'inner'),
        join(directory, 'inner-link'),
      );

      expect(await session.listDirectory({ path: 'inner-link/..' })).toEqual([
        { name: 'inner', type: 'directory' },
      ]);
    });

    it('returns an empty array for an empty directory', async () => {
      await mkdir(join(directory, 'empty'));
      expect(await session.listDirectory({ path: 'empty' })).toEqual([]);
    });

    it('returns null for a missing directory', async () => {
      expect(await session.listDirectory({ path: 'missing' })).toBeNull();
    });

    it('rejects for a file', async () => {
      await expect(session.listDirectory({ path: 'file.txt' })).rejects.toThrow(
        'Not a directory',
      );
    });

    it('lists a directory through a symbolic link', async () => {
      expect(await session.listDirectory({ path: 'dir-link' })).toEqual([
        { name: 'nested.txt', type: 'file' },
      ]);
    });

    it('returns null for a broken symbolic link', async () => {
      expect(await session.listDirectory({ path: 'broken-link' })).toBeNull();
    });

    it.skipIf(process.getuid?.() === 0)(
      'rejects for a directory that can be entered but not read',
      async () => {
        await chmod(join(directory, 'dir'), 0o311);
        try {
          await expect(session.listDirectory({ path: 'dir' })).rejects.toThrow(
            'Permission denied',
          );
        } finally {
          await chmod(join(directory, 'dir'), 0o755);
        }
      },
    );

    it('lists a directory named `-`', async () => {
      await mkdir(join(directory, '-'));
      await writeFile(join(directory, '-', 'inside.txt'), '');
      expect(await session.listDirectory({ path: '-' })).toEqual([
        { name: 'inside.txt', type: 'file' },
      ]);
    });
  });

  describe('deleteFile', () => {
    it('deletes a file', async () => {
      expect(await session.deleteFile({ path: 'file.txt' })).toBe(true);
      expect(await session.stat({ path: 'file.txt' })).toBeNull();
    });

    it('returns false for a missing file', async () => {
      expect(await session.deleteFile({ path: 'missing.txt' })).toBe(false);
    });

    it('rejects for a directory', async () => {
      await expect(session.deleteFile({ path: 'dir' })).rejects.toThrow(
        'it is a directory',
      );
      expect(await session.stat({ path: 'dir' })).not.toBeNull();
    });

    it.each(['dir-link', 'file-link', 'broken-link'])(
      'deletes the symbolic link %s itself',
      async link => {
        expect(await session.deleteFile({ path: link })).toBe(true);
        expect(await session.listDirectory({ path: '.' })).not.toContainEqual({
          name: link,
          type: 'symlink',
        });
      },
    );

    it('keeps the target of a deleted symbolic link', async () => {
      await session.deleteFile({ path: 'dir-link' });
      expect(await session.listDirectory({ path: 'dir' })).toEqual([
        { name: 'nested.txt', type: 'file' },
      ]);
    });

    it('rejects for a symbolic link to a directory with a trailing slash', async () => {
      await expect(session.deleteFile({ path: 'dir-link/' })).rejects.toThrow(
        'it is a directory',
      );
      expect(await session.stat({ path: 'dir-link' })).not.toBeNull();
      expect(await session.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });

    it('deletes a file in a symbolically linked directory', async () => {
      expect(await session.deleteFile({ path: 'dir-link/nested.txt' })).toBe(
        true,
      );
      expect(await session.stat({ path: 'dir/nested.txt' })).toBeNull();
    });
  });

  it('passes paths as arguments instead of interpolating them', async () => {
    const path = '$(touch injected)';

    expect(await session.stat({ path })).toBeNull();
    expect(await session.listDirectory({ path })).toBeNull();
    expect(await session.deleteFile({ path })).toBe(false);
    expect(await session.stat({ path: 'injected' })).toBeNull();
  });
});
