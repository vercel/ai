import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import type { Experimental_SandboxProcess } from '@ai-sdk/provider-utils';
import {
  DEFAULT_MAX_BYTES,
  type BashToolInput,
} from '@earendil-works/pi-coding-agent';
import { describe, expect, test, vi } from 'vitest';
import { createPiBashTool, RetainedOutput } from './pi-bash-tool';

async function setup() {
  const session = await createJustBashNetworkSandboxSession();
  const workDir = session.defaultWorkingDirectory;
  const updates: string[] = [];
  const tool = createPiBashTool({ session, workDir });
  const bash = ({
    input,
    abortSignal,
  }: {
    input: BashToolInput;
    abortSignal?: AbortSignal;
  }) =>
    tool.execute(
      'call-1',
      input,
      abortSignal ?? new AbortController().signal,
      partial =>
        updates.push(
          partial.content.map(part => (part as { text: string }).text).join(''),
        ),
    );
  return { session, workDir, bash, updates };
}

function text(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content.map(part => part.text).join('');
}

describe('createPiBashTool', () => {
  test('returns the combined output', async () => {
    const { bash, updates } = await setup();

    const result = await bash({ input: { command: 'echo out; echo err >&2' } });

    expect(text(result)).toBe('out\nerr\n');
    expect(result.isError).toBeUndefined();
    expect(updates.at(-1)).toBe('out\nerr\n');
  });

  test('reports empty output and nonzero exit codes', async () => {
    const { bash } = await setup();

    expect(text(await bash({ input: { command: 'true' } }))).toBe(
      '(no output)',
    );
    const failed = await bash({ input: { command: 'echo nope; exit 3' } });
    expect(failed).toMatchObject({ isError: true });
    expect(text(failed)).toBe('nope\n\n\nCommand exited with code 3');
  });

  test('validates the timeout', async () => {
    const { bash } = await setup();

    await expect(
      bash({ input: { command: 'true', timeout: 0 } }),
    ).rejects.toThrow('Invalid timeout: must be a finite number of seconds');
  });

  test('fails when the timeout elapses', async () => {
    const { bash } = await setup();

    await expect(
      bash({ input: { command: 'sleep 5', timeout: 0.2 } }),
    ).rejects.toThrow('Command timed out after 0.2 seconds');
  });

  test('fails when aborted', async () => {
    const { bash } = await setup();
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      bash({
        input: { command: 'echo hi' },
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow('Command aborted');
  });

  test('writes truncated output to a file in the sandbox', async () => {
    const { session, bash } = await setup();

    const result = await bash({ input: { command: 'seq 1 3000' } });

    expect(text(result)).toMatch(
      /\n3000\n\n\[Showing lines 1001-3000 of 3000\. Full output: \/tmp\/pi-bash-call-1\.log\]$/,
    );
    expect(result.details?.fullOutputPath).toBe('/tmp/pi-bash-call-1.log');
    const full = await session.readTextFile({
      path: '/tmp/pi-bash-call-1.log',
    });
    expect(full?.endsWith('2999\n3000\n')).toBe(true);
    expect(full?.startsWith('1\n2\n')).toBe(true);
  });

  test('writes the retained tail to a file in the sandbox', async () => {
    const { session, bash } = await setup();

    const result = await bash({ input: { command: 'seq 1 100000' } });

    expect(text(result)).toMatch(
      /\n100000\n\n\[Showing lines 98001-100000 of 100000\. Output truncated at \d+\.\dKB: \/tmp\/pi-bash-call-1\.log\]$/,
    );
    const full = await session.stat({ path: '/tmp/pi-bash-call-1.log' });
    expect(full!.size).toBeLessThanOrEqual(200 * 1024);
    const tail = await session.readTextFile({
      path: '/tmp/pi-bash-call-1.log',
    });
    expect(tail?.endsWith('99999\n100000\n')).toBe(true);
  });

  test('keeps the end of a single line that exceeds the byte limit', async () => {
    const { session, bash } = await setup();

    const result = await bash({
      input: { command: `seq 1 100000 | tr -d '\\n'` },
    });

    expect(text(result)).toMatch(
      /\n\n\[Showing last 50\.0KB of line 1 \(line is 477\.4KB\)\. Output truncated at \d+\.\dKB: \/tmp\/pi-bash-call-1\.log\]$/,
    );
    const full = await session.stat({ path: '/tmp/pi-bash-call-1.log' });
    expect(full!.size).toBeLessThanOrEqual(200 * 1024);
  });

  test('writes no output file when the output is not truncated', async () => {
    const { session, bash } = await setup();

    const result = await bash({ input: { command: 'echo hi' } });

    expect(text(result)).toBe('hi\n');
    expect(result.details).toBeUndefined();
    expect(await session.stat({ path: '/tmp/pi-bash-call-1.log' })).toBeNull();
  });

  test('stops a command that floods its output', async () => {
    let killed = false;
    let sent = 0;
    const chunk = new TextEncoder().encode(`${'x'.repeat(63)}\n`);
    const session = await createJustBashNetworkSandboxSession();
    // The sandbox doubles stop long commands before they can flood, and their
    // memory is the host's, so the command is replaced by a stream.
    const floodingProcess: Experimental_SandboxProcess = {
      stdout: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (killed || sent > 20 * 1024 * 1024) {
            controller.close();
            return;
          }
          controller.enqueue(chunk);
          sent += chunk.length;
        },
      }),
      stderr: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
      wait: async () => ({ exitCode: killed ? 137 : 0 }),
      kill: async () => {
        killed = true;
      },
    };
    vi.spyOn(session, 'spawn').mockImplementation(async () => floodingProcess);
    const tool = createPiBashTool({ session, workDir: '/workspace' });

    const result = await tool.execute(
      'call-1',
      { command: 'noisy' },
      new AbortController().signal,
      () => {},
    );

    expect(killed).toBe(true);
    expect(result).toMatchObject({ isError: true });
    expect(text(result)).toMatch(
      /Command stopped after producing more than 16\.0MB of output$/,
    );
  });

  test('returns when a stopped command keeps its output open', async () => {
    let sent = 0;
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024 - 1) + '\n');
    // A sandbox can leave a writer alive after the shell it killed, and then
    // `wait()` returns while the output stream stays open. The stream parks
    // instead of closing, without spinning.
    const floodingProcess: Experimental_SandboxProcess = {
      stdout: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent > 20 * 1024 * 1024) return new Promise(() => {});
          controller.enqueue(chunk);
          sent += chunk.length;
          return undefined;
        },
      }),
      stderr: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      }),
      wait: async () => ({ exitCode: 143 }),
      kill: async () => {},
    };
    const session = await createJustBashNetworkSandboxSession();
    vi.spyOn(session, 'spawn').mockImplementation(async () => floodingProcess);
    const tool = createPiBashTool({ session, workDir: '/workspace' });

    const result = await tool.execute(
      'call-1',
      { command: 'noisy' },
      new AbortController().signal,
      () => {},
    );

    expect(result).toMatchObject({ isError: true });
    expect(text(result)).toMatch(
      /Command stopped after producing more than 16\.0MB of output$/,
    );
  });

  test('keeps the shell semantics of the command', async () => {
    const { bash } = await setup();

    expect(text(await bash({ input: { command: 'echo hi | cat' } }))).toBe(
      'hi\n',
    );
    // As in bash, the exit code of a pipeline is the last command's.
    expect(
      (await bash({ input: { command: 'false | cat' } })).isError,
    ).toBeUndefined();
    expect(
      text(await bash({ input: { command: 'cat <<EOF\nhi\nthere\nEOF' } })),
    ).toBe('hi\nthere\n');

    const failed = await bash({
      input: { command: 'set -e; false; echo after' },
    });
    expect(failed).toMatchObject({ isError: true });
    expect(text(failed)).toBe('(no output)\n\nCommand exited with code 1');
  });

  test('keeps the exit code and trailing comments of the command', async () => {
    const { bash } = await setup();

    expect(text(await bash({ input: { command: 'echo hi # comment' } }))).toBe(
      'hi\n',
    );
    const failed = await bash({ input: { command: 'echo bye; exit 4' } });
    expect(failed).toMatchObject({ isError: true });
    expect(text(failed)).toBe('bye\n\n\nCommand exited with code 4');
  });
});

describe('RetainedOutput', () => {
  test('keeps only a bounded tail of output far above the limits', () => {
    const output = new RetainedOutput();
    const line = 'line\n';
    for (let index = 0; index < 100_000; index++) output.append(line);

    // Twice the tail kept for display, i.e. the hard bound of the class.
    expect(output.retainedBytes).toBeLessThanOrEqual(4 * DEFAULT_MAX_BYTES);

    const truncation = output.snapshot();
    expect(truncation.truncated).toBe(true);
    expect(truncation.truncatedBy).toBe('lines');
    expect(truncation.totalBytes).toBe(500_000);
    expect(truncation.totalLines).toBe(100_000);
    expect(truncation.outputLines).toBe(2000);
    expect(truncation.content.split('\n')).toHaveLength(2000);
    expect(truncation.content.endsWith('line')).toBe(true);
  });

  test('keeps the end of a line that exceeds the byte limit', () => {
    const output = new RetainedOutput();
    output.append('a'.repeat(300_000));

    // Twice the tail kept for display, i.e. the hard bound of the class.
    expect(output.retainedBytes).toBeLessThanOrEqual(4 * DEFAULT_MAX_BYTES);

    const truncation = output.snapshot();
    expect(truncation).toMatchObject({
      truncated: true,
      truncatedBy: 'bytes',
      lastLinePartial: true,
      totalBytes: 300_000,
      totalLines: 1,
    });
    expect(truncation.content).toBe('a'.repeat(DEFAULT_MAX_BYTES));
    expect(output.lastLineBytes).toBe(300_000);
  });

  test('returns output within the limits unchanged', () => {
    const output = new RetainedOutput();
    output.append('out\n');
    output.append('err\n');

    expect(output.snapshot()).toMatchObject({
      content: 'out\nerr\n',
      truncated: false,
      truncatedBy: null,
      totalBytes: 8,
      totalLines: 2,
    });
    expect(output.retainedBytes).toBe(8);
  });
});
