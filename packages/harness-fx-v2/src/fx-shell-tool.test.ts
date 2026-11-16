import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { describe, expect, test } from 'vitest';
import type { FxToolSandbox } from './fx-builtin-tools';
import type { FxShellInput } from './fx-builtin-tool-specs';
import {
  createFxOutputCapture,
  runFxShell,
  toFxTerminalSafeOutput,
} from './fx-shell-tool';

async function setup() {
  const session = await createJustBashNetworkSandboxSession();
  const workDir = session.defaultWorkingDirectory;
  const sandbox: FxToolSandbox = { session, workDir, home: workDir };
  const shell = async (input: FxShellInput) => {
    const output = await runFxShell({
      sandbox,
      toolCallId: 'call-1',
      input,
      abortSignal: new AbortController().signal,
    });
    const parsed = await safeParseJSON({ text: output.text });
    if (!parsed.success) return output;
    /*
     * The duration differs between runs, so it is removed from the result
     * before it is compared.
     */
    const { duration_ms: _duration, ...result } = parsed.value as Record<
      string,
      unknown
    >;
    return { ...output, text: result };
  };
  return { session, workDir, shell };
}

describe('toFxTerminalSafeOutput', () => {
  test('keeps valid UTF-8 output unchanged', () => {
    expect(
      toFxTerminalSafeOutput({
        bytes: new TextEncoder().encode('ok\u001b[31mred\n'),
      }),
    ).toEqual({ text: 'ok\u001b[31mred\n', escaped: false });
  });

  test('escapes output with invalid UTF-8 or NUL bytes', () => {
    expect(
      toFxTerminalSafeOutput({
        bytes: Uint8Array.from([0x6f, 0x6b, 0x00, 0xff, 0x1b, 0x0a]),
      }),
    ).toMatchInlineSnapshot(`
      {
        "escaped": true,
        "text": "ok\\x00\\xff\\x1b\\x0a",
      }
    `);
  });
});

describe('runFxShell', () => {
  test('runs a command in the working directory', async () => {
    const { session, workDir, shell } = await setup();

    expect(
      await shell({
        action: 'run',
        command: "printf 'run\\n' >> runs.txt; pwd",
      }),
    ).toMatchInlineSnapshot(`
      {
        "text": {
          "accepted_bytes": null,
          "backend": "sandbox",
          "error": null,
          "exit_code": 0,
          "full_output_handle": null,
          "output_delta": "/home/user
      ",
          "output_incomplete": false,
          "output_terminal_safe": true,
          "output_truncated": false,
          "persistence": "none",
          "retry_guidance": null,
          "session_id": null,
          "signal": null,
          "state": "completed",
          "termination_indeterminate": false,
        },
      }
    `);
    expect(await session.readTextFile({ path: `${workDir}/runs.txt` })).toBe(
      'run\n',
    );
  });

  test('reports a failing command with its exit code', async () => {
    const { shell } = await setup();

    expect(await shell({ action: 'run', command: 'echo failed >&2; exit 3' }))
      .toMatchInlineSnapshot(`
      {
        "isError": true,
        "text": {
          "accepted_bytes": null,
          "backend": "sandbox",
          "error": null,
          "exit_code": 3,
          "full_output_handle": null,
          "output_delta": "failed
      ",
          "output_incomplete": false,
          "output_terminal_safe": true,
          "output_truncated": false,
          "persistence": "none",
          "retry_guidance": null,
          "session_id": null,
          "signal": null,
          "state": "completed",
          "termination_indeterminate": false,
        },
      }
    `);
  });

  test('runs in the requested directory', async () => {
    const { session, workDir, shell } = await setup();
    await session.writeTextFile({
      path: `${workDir}/sub/file.txt`,
      content: '',
    });

    expect(
      await shell({ action: 'run', command: 'ls', cwd: 'sub' }),
    ).toMatchObject({ text: { exit_code: 0, output_delta: 'file.txt\n' } });
  });

  test('rejects interact and stop, since no command outlives its call', async () => {
    const { shell } = await setup();

    expect(await shell({ action: 'interact', session_id: 'abc' }))
      .toMatchInlineSnapshot(`
      {
        "isError": true,
        "text": "no shell has session_id "abc": every command here completes in its run call and nothing keeps running",
      }
    `);
  });
});

/**
 * Fake sandbox session whose command streams a fixed number of equal chunks,
 * so a test controls how many output bytes the host has to handle, and that
 * records whether the command was killed and what was written to the sandbox.
 */
function createFakeShellSession(options: {
  chunkSize: number;
  chunkCount: number;
}) {
  const { chunkSize, chunkCount } = options;
  const state = { killed: 0, sent: 0, writes: [] as number[] };
  // oxlint-disable-next-line ai-sdk/no-as-unknown-as -- partial sandbox session for a test.
  const session = {
    description: 'fake sandbox',
    async stat() {
      return { type: 'directory', size: 0 };
    },
    async writeBinaryFile({ content }: { content: Uint8Array }) {
      state.writes.push(content.length);
    },
    async spawn() {
      let closed = false;
      let resolveClosed = () => {};
      const done = new Promise<void>(resolve => {
        resolveClosed = resolve;
      });
      const stdout = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (state.killed > 0 || state.sent >= chunkCount) {
            if (!closed) {
              closed = true;
              resolveClosed();
            }
            controller.close();
            return;
          }
          state.sent++;
          controller.enqueue(new Uint8Array(chunkSize).fill(0x78));
        },
      });
      return {
        stdout,
        stderr: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close();
          },
        }),
        async wait() {
          await done;
          return { exitCode: state.killed > 0 ? 137 : 0 };
        },
        async kill() {
          state.killed++;
        },
      };
    },
  } as unknown as FxToolSandbox['session'];
  return { session, state };
}

const MIB = 1024 * 1024;

describe('createFxOutputCapture', () => {
  test('keeps output that fits the kept head and tail', () => {
    const capture = createFxOutputCapture({ headBytes: 4, tailBytes: 4 });
    capture.add(Uint8Array.from([1, 2, 3]));

    expect(capture.complete).toBe(true);
    expect(capture.totalBytes).toBe(3);
    expect([...capture.toBytes()]).toEqual([1, 2, 3]);
  });

  test('keeps only the head and the tail of a large output', () => {
    const capture = createFxOutputCapture({ headBytes: 4, tailBytes: 4 });
    capture.add(Uint8Array.from([1, 2, 3]));
    capture.add(Uint8Array.from([4, 5, 6, 7, 8, 9, 10]));

    expect(capture.complete).toBe(false);
    expect(capture.totalBytes).toBe(10);
    expect([...capture.toBytes()]).toEqual([1, 2, 3, 4, 7, 8, 9, 10]);
  });

  test('keeps one large chunk bounded too', () => {
    const capture = createFxOutputCapture({
      headBytes: 64 * 1024,
      tailBytes: 64 * 1024,
    });
    for (let index = 0; index < 16; index++) {
      capture.add(new Uint8Array(MIB).fill(index));
    }

    expect(capture.complete).toBe(false);
    expect(capture.totalBytes).toBe(16 * MIB);
    expect(capture.toBytes().length).toBe(128 * 1024);
    expect(capture.toBytes()[0]).toBe(0);
    expect(capture.toBytes().at(-1)).toBe(15);
  });

  test('cuts the kept bytes at UTF-8 character boundaries', () => {
    // 'a€bc€d', so that both cut ends fall inside a character.
    const output = new TextEncoder().encode('a\u20acbc\u20acd');
    const capture = createFxOutputCapture({ headBytes: 2, tailBytes: 2 });
    capture.add(output);

    expect(
      new TextDecoder('utf-8', { fatal: true }).decode(capture.toBytes()),
    ).toBe('ad');
  });
});

/**
 * Parses the JSON snapshot of a shell result.
 */
async function parseShellResult(
  text: string,
): Promise<Record<string, unknown>> {
  const parsed = await safeParseJSON({ text });
  if (!parsed.success) throw new Error(`the result is not JSON: ${text}`);
  return parsed.value as Record<string, unknown>;
}

describe('runFxShell with large output', () => {
  const testSandbox = (session: FxToolSandbox['session']): FxToolSandbox => ({
    session,
    workDir: '/home/user',
    home: '/home/user',
  });

  test('stops a command that floods its output and keeps host memory bounded', async () => {
    const { session, state } = createFakeShellSession({
      chunkSize: 64 * 1024,
      chunkCount: 300,
    });
    const output = await runFxShell({
      sandbox: testSandbox(session),
      toolCallId: 'call-1',
      input: { action: 'run', command: 'yes' },
      abortSignal: new AbortController().signal,
    });
    const result = await parseShellResult(output.text);

    expect(result).toMatchObject({
      state: 'stopped',
      error: 'OutputLimitExceeded',
      output_truncated: true,
      output_incomplete: true,
      full_output_handle: null,
      exit_code: 137,
    });
    expect(output.isError).toBe(true);
    // Almost 19 MiB of output reached the host, but only the kept bytes can.
    expect(state.sent).toBeGreaterThanOrEqual(258);
    expect(
      Buffer.byteLength(result.output_delta as string),
    ).toBeLessThanOrEqual(16 * 1024);
    expect(result.output_delta).toContain('drops the rest');
    expect(result.retry_guidance).toContain('was stopped');
    expect(state.writes).toEqual([]);
  });

  test('keeps a head and a tail of a large but finite output', async () => {
    const { session, state } = createFakeShellSession({
      chunkSize: 64 * 1024,
      chunkCount: 8,
    });
    const output = await runFxShell({
      sandbox: testSandbox(session),
      toolCallId: 'call-1',
      input: { action: 'run', command: 'seq 1 1000000' },
      abortSignal: new AbortController().signal,
    });
    const result = await parseShellResult(output.text);
    const outputDelta = result.output_delta as string;

    expect(result).toMatchObject({
      state: 'completed',
      error: null,
      output_truncated: true,
      output_incomplete: true,
      full_output_handle: null,
      exit_code: 0,
    });
    expect(output.isError).toBeUndefined();
    expect(state.killed).toBe(0);
    expect(Buffer.byteLength(outputDelta)).toBeLessThanOrEqual(16 * 1024);
    expect(outputDelta.startsWith('x'.repeat(1000))).toBe(true);
    expect(outputDelta.endsWith('x'.repeat(1000))).toBe(true);
    expect(result.retry_guidance).toContain('middle of its output is missing');
    expect(state.writes).toEqual([]);
  });

  test('keeps and stores the exact output of a command that fits', async () => {
    const { session, state } = createFakeShellSession({
      chunkSize: 16 * 1024,
      chunkCount: 4,
    });
    const output = await runFxShell({
      sandbox: testSandbox(session),
      toolCallId: 'call-1',
      input: { action: 'run', command: 'cat build.log' },
      abortSignal: new AbortController().signal,
    });
    const result = await parseShellResult(output.text);

    expect(result).toMatchObject({
      output_truncated: true,
      output_incomplete: false,
      full_output_handle: '/tmp/fx-shell-call-1.log',
      exit_code: 0,
    });
    expect(state.writes).toEqual([64 * 1024]);
    expect(result.output_delta).toContain('full_output_handle');
    expect(state.killed).toBe(0);
  });
});
