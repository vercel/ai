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
