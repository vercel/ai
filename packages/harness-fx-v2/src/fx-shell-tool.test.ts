import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { describe, expect, test } from 'vitest';
import type { FxToolSandbox } from './fx-builtin-tools';
import type { FxShellInput } from './fx-builtin-tool-specs';
import { runFxShell, toFxTerminalSafeOutput } from './fx-shell-tool';

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
 * With `stuck`, the command leaves its streams open after a kill, like a
 * sandbox whose child processes still hold the pipe.
 */
function createFakeShellSession(options: {
  chunkSize: number;
  chunkCount: number;
  stuck?: boolean;
}) {
  const { chunkSize, chunkCount, stuck = false } = options;
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
    async spawn({ abortSignal }: { abortSignal?: AbortSignal }) {
      let closed = false;
      let resolveClosed = () => {};
      const done = new Promise<void>(resolve => {
        resolveClosed = resolve;
      });
      const aborted = new Promise<never>((_, reject) => {
        abortSignal?.addEventListener(
          'abort',
          () => reject(abortSignal.reason),
          { once: true },
        );
      });
      const stdout = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (state.killed > 0 || state.sent >= chunkCount) {
            if (stuck) return;
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
          return Promise.race([
            done.then(() => ({ exitCode: state.killed > 0 ? 137 : 0 })),
            aborted,
          ]);
        },
        async kill() {
          state.killed++;
        },
      };
    },
  } as unknown as FxToolSandbox['session'];
  return { session, state };
}

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
      exit_code: null,
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

  test('returns when the sandbox leaves the streams open after a stop', async () => {
    const { session, state } = createFakeShellSession({
      chunkSize: 64 * 1024,
      chunkCount: 300,
      stuck: true,
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
      output_incomplete: true,
    });
    expect(state.killed).toBe(1);
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
