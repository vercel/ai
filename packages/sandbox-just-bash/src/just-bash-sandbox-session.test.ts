import { Sandbox } from 'just-bash';
import { beforeEach, describe, expect, it } from 'vitest';
import { createJustBashSandboxSessionFromNativeSandbox } from './just-bash-sandbox';
import { JustBashSandboxSession } from './just-bash-sandbox-session';

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

async function spawnSyntheticProcess(
  messages: Array<{ type: 'stdout' | 'stderr'; data: string }>,
) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let logsDrained = false;

  const command = {
    async *logs() {
      await gate;
      yield* messages;
      logsDrained = true;
    },
    async wait() {
      await gate;
      return { exitCode: 0 };
    },
    async kill() {},
  };

  const session = createJustBashSandboxSessionFromNativeSandbox({
    bashEnvInstance: {
      getCwd: () => '/',
      exec: async () => ({ exitCode: 0 }),
    },
    runCommand: async () => command,
  } as never);

  return {
    process: await session.spawn({ command: 'synthetic' }),
    release,
    logsDrained: () => logsDrained,
  };
}

describe('JustBashSandboxSession', () => {
  let sandbox: JustBashSandboxSession;

  beforeEach(async () => {
    sandbox = new JustBashSandboxSession(
      await Sandbox.create({ cwd: '/work' }),
    );
  });

  describe('description', () => {
    it('mentions the current working directory', () => {
      expect(sandbox.description).toContain('Current working directory: /work');
    });
  });

  describe('run', () => {
    it('returns stdout, stderr, and exitCode', async () => {
      const result = await sandbox.run({
        command: 'echo hello && echo bye >&2',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello\n');
      expect(result.stderr).toBe('bye\n');
    });

    it('honours workingDirectory', async () => {
      await sandbox.run({ command: 'mkdir -p /tmp/cwd-test' });

      const result = await sandbox.run({
        command: 'pwd',
        workingDirectory: '/tmp/cwd-test',
      });

      expect(result.stdout.trim()).toBe('/tmp/cwd-test');
    });

    it('makes per-command environment variables available', async () => {
      const workDir = '/tmp/env test';
      const value = 'value with spaces and "$(shell syntax)"';

      const result = await sandbox.run({
        command:
          'mkdir -p "$WORK_DIR" && printf "%s" "$VALUE" && test "$UNSET_AFTER" = scoped',
        env: {
          WORK_DIR: workDir,
          VALUE: value,
          UNSET_AFTER: 'scoped',
        },
      });

      expect(result).toEqual({
        exitCode: 0,
        stdout: value,
        stderr: '',
      });
      expect(
        (
          await sandbox.run({
            command: `test -d '${workDir}' && test -z "$UNSET_AFTER"`,
          })
        ).exitCode,
      ).toBe(0);
    });

    it('throws when abortSignal is already aborted', async () => {
      const ac = new AbortController();
      ac.abort();
      await expect(
        sandbox.run({ command: 'echo hi', abortSignal: ac.signal }),
      ).rejects.toThrow();
    });
  });

  describe('file I/O', () => {
    it('writes and reads text files', async () => {
      await sandbox.writeTextFile({
        path: '/work/notes.txt',
        content: 'line 1\nline 2\nline 3\n',
      });

      const full = await sandbox.readTextFile({ path: '/work/notes.txt' });
      expect(full).toBe('line 1\nline 2\nline 3\n');

      const slice = await sandbox.readTextFile({
        path: '/work/notes.txt',
        startLine: 2,
        endLine: 3,
      });
      expect(slice).toBe('line 2\nline 3');
    });

    it('resolves relative paths against the sandbox cwd', async () => {
      await sandbox.writeTextFile({
        path: 'relative.txt',
        content: 'hi',
      });

      const absolute = await sandbox.readTextFile({
        path: '/work/relative.txt',
      });
      expect(absolute).toBe('hi');
    });

    it('returns null when reading a missing file', async () => {
      expect(
        await sandbox.readTextFile({ path: '/work/does-not-exist.txt' }),
      ).toBeNull();
      expect(
        await sandbox.readBinaryFile({ path: '/work/does-not-exist.txt' }),
      ).toBeNull();
      expect(
        await sandbox.readFile({ path: '/work/does-not-exist.txt' }),
      ).toBeNull();
    });

    it('round-trips binary payloads', async () => {
      const payload = new Uint8Array([0, 1, 2, 255, 254, 0, 128]);
      await sandbox.writeBinaryFile({
        path: '/work/bytes.bin',
        content: payload,
      });

      const out = await sandbox.readBinaryFile({ path: '/work/bytes.bin' });
      expect(out).toEqual(payload);
    });

    it('writeFile and readFile stream through the VFS', async () => {
      const bytes = new TextEncoder().encode('streamed');
      await sandbox.writeFile({
        path: '/work/streamed.txt',
        content: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
      });

      const stream = await sandbox.readFile({ path: '/work/streamed.txt' });
      expect(stream).not.toBeNull();
      expect(await collect(stream!)).toBe('streamed');
    });
  });

  describe('spawn', () => {
    it('installs realpath before starting the first process', async () => {
      const proc = await sandbox.spawn({ command: 'realpath /work' });
      const [stdout, { exitCode }] = await Promise.all([
        collect(proc.stdout),
        proc.wait(),
      ]);

      expect(stdout).toBe('/work\n');
      expect(exitCode).toBe(0);
    });

    it('streams stdout and stderr and resolves wait() with exit code', async () => {
      const proc = await sandbox.spawn({
        command: 'echo out && echo err >&2',
      });

      const [stdout, stderr, { exitCode }] = await Promise.all([
        collect(proc.stdout),
        collect(proc.stderr),
        proc.wait(),
      ]);

      expect(stdout).toBe('out\n');
      expect(stderr).toBe('err\n');
      expect(exitCode).toBe(0);
    });

    it('continues streaming stderr after stdout is cancelled', async () => {
      const { process, release } = await spawnSyntheticProcess([
        { type: 'stdout', data: 'ignored output' },
        { type: 'stderr', data: 'needed diagnostic' },
      ]);

      await process.stdout.cancel();
      release();

      await expect(collect(process.stderr)).resolves.toBe('needed diagnostic');
      await expect(process.wait()).resolves.toEqual({ exitCode: 0 });
    });

    it('continues streaming stdout after stderr is cancelled', async () => {
      const { process, release } = await spawnSyntheticProcess([
        { type: 'stderr', data: 'ignored diagnostic' },
        { type: 'stdout', data: 'needed output' },
      ]);

      await process.stderr.cancel();
      release();

      await expect(collect(process.stdout)).resolves.toBe('needed output');
      await expect(process.wait()).resolves.toEqual({ exitCode: 0 });
    });

    it('drains process logs after both output streams are cancelled', async () => {
      const { process, release, logsDrained } = await spawnSyntheticProcess([
        { type: 'stdout', data: 'ignored output' },
        { type: 'stderr', data: 'ignored diagnostic' },
      ]);

      await Promise.all([process.stdout.cancel(), process.stderr.cancel()]);
      release();

      await expect(process.wait()).resolves.toEqual({ exitCode: 0 });
      expect(logsDrained()).toBe(true);
    });

    it('makes per-command environment variables available', async () => {
      const value = 'spawned value with "$(shell syntax)"';
      const proc = await sandbox.spawn({
        command: 'printf "%s" "$SPAWN_VALUE"',
        env: { SPAWN_VALUE: value },
      });

      const [stdout, stderr, { exitCode }] = await Promise.all([
        collect(proc.stdout),
        collect(proc.stderr),
        proc.wait(),
      ]);

      expect(stdout).toBe(value);
      expect(stderr).toBe('');
      expect(exitCode).toBe(0);
    });

    it('shares the VFS with file operations', async () => {
      await sandbox.writeTextFile({
        path: '/work/shared.txt',
        content: 'shared payload',
      });

      const proc = await sandbox.spawn({
        command: 'cat /work/shared.txt',
      });

      const stdout = await collect(proc.stdout);
      await proc.wait();
      expect(stdout).toBe('shared payload');
    });

    it('non-zero exit codes are surfaced via wait()', async () => {
      const proc = await sandbox.spawn({ command: 'exit 7' });
      await collect(proc.stdout);
      await collect(proc.stderr);
      const result = await proc.wait();
      expect(result.exitCode).toBe(7);
    });

    it('kill() terminates the process', async () => {
      const proc = await sandbox.spawn({
        command: 'sleep 10',
      });
      await proc.kill();
      const result = await proc.wait();
      expect(result.exitCode).not.toBe(0);
    });

    it('abortSignal aborts a running process', async () => {
      const ac = new AbortController();
      const proc = await sandbox.spawn({
        command: 'sleep 10',
        abortSignal: ac.signal,
      });
      ac.abort();
      await expect(proc.wait()).rejects.toThrow();
    });
  });
});
