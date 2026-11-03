import { Sandbox } from 'just-bash';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('resolves a relative workingDirectory against the sandbox cwd', async () => {
      await sandbox.run({ command: 'mkdir -p /work/sub' });

      const result = await sandbox.run({
        command: 'pwd',
        workingDirectory: 'sub',
      });

      expect(result.stdout.trim()).toBe('/work/sub');
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

  describe('path methods', () => {
    beforeEach(async () => {
      await sandbox.writeTextFile({ path: '/work/file.txt', content: 'hello' });
      await sandbox.writeTextFile({
        path: '/work/dir/nested.txt',
        content: '',
      });
      await sandbox.run({
        command:
          'ln -s /work/file.txt file-link && ln -s /work/dir dir-link && ln -s /work/missing broken-link',
      });
    });

    it('stat returns the type and size of a file', async () => {
      expect(await sandbox.stat({ path: 'file.txt' })).toEqual({
        type: 'file',
        size: 5,
      });
    });

    it('stat returns directory for a directory', async () => {
      expect(await sandbox.stat({ path: '/work/dir' })).toEqual({
        type: 'directory',
        size: expect.any(Number),
      });
    });

    it('stat follows symbolic links', async () => {
      expect(await sandbox.stat({ path: 'file-link' })).toEqual({
        type: 'file',
        size: 5,
      });
    });

    it('stat returns null for a missing path', async () => {
      expect(await sandbox.stat({ path: 'missing.txt' })).toBeNull();
      expect(await sandbox.stat({ path: 'file.txt/child' })).toBeNull();
    });

    it('listDirectory lists entries with their types', async () => {
      const entries = await sandbox.listDirectory({ path: '.' });

      expect(entries?.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: 'broken-link', type: 'symlink' },
        { name: 'dir', type: 'directory' },
        { name: 'dir-link', type: 'symlink' },
        { name: 'file-link', type: 'symlink' },
        { name: 'file.txt', type: 'file' },
      ]);
    });

    it('stat returns null for a broken symbolic link', async () => {
      expect(await sandbox.stat({ path: 'broken-link' })).toBeNull();
    });

    it('listDirectory lists a directory through a symbolic link', async () => {
      expect(await sandbox.listDirectory({ path: 'dir-link' })).toEqual([
        { name: 'nested.txt', type: 'file' },
      ]);
    });

    it('listDirectory returns null for a broken symbolic link', async () => {
      expect(await sandbox.listDirectory({ path: 'broken-link' })).toBeNull();
    });

    it('listDirectory falls back to lstat without readdirWithFileTypes', async () => {
      const nativeSandbox = await Sandbox.create({ cwd: '/work' });
      const session = new JustBashSandboxSession(nativeSandbox);
      await session.writeTextFile({ path: 'file.txt', content: '' });
      await session.run({ command: 'mkdir dir && ln -s /work/dir dir-link' });
      // The built-in `readdir` uses `readdirWithFileTypes`, so only hide it
      // from the adapter.
      const fs = nativeSandbox.bashEnvInstance.fs;
      Object.defineProperty(nativeSandbox.bashEnvInstance, 'fs', {
        value: new Proxy(fs, {
          get: (target, property) => {
            if (property === 'readdirWithFileTypes') return undefined;
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      });

      const entries = await session.listDirectory({ path: '.' });

      expect(entries?.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: 'dir', type: 'directory' },
        { name: 'dir-link', type: 'symlink' },
        { name: 'file.txt', type: 'file' },
      ]);
    });

    it('listDirectory returns null for a missing directory', async () => {
      expect(await sandbox.listDirectory({ path: 'missing' })).toBeNull();
    });

    it('listDirectory rejects for a file', async () => {
      await expect(
        sandbox.listDirectory({ path: 'file.txt' }),
      ).rejects.toThrow();
    });

    it('writeTextFile rejects for a directory and keeps its contents', async () => {
      await expect(
        sandbox.writeTextFile({ path: 'dir', content: 'x' }),
      ).rejects.toThrow('it is a directory');
      expect(await sandbox.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });

    it('deleteFile deletes a file', async () => {
      expect(await sandbox.deleteFile({ path: 'file.txt' })).toBe(true);
      expect(await sandbox.stat({ path: 'file.txt' })).toBeNull();
    });

    it('deleteFile deletes a broken symbolic link', async () => {
      expect(await sandbox.deleteFile({ path: 'broken-link' })).toBe(true);
      expect(
        (await sandbox.listDirectory({ path: '.' }))?.map(entry => entry.name),
      ).not.toContain('broken-link');
    });

    it('path methods reject when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const abortSignal = controller.signal;

      await expect(
        sandbox.stat({ path: 'file.txt', abortSignal }),
      ).rejects.toThrow();
      await expect(
        sandbox.listDirectory({ path: '.', abortSignal }),
      ).rejects.toThrow();
      await expect(
        sandbox.deleteFile({ path: 'file.txt', abortSignal }),
      ).rejects.toThrow();
      expect(await sandbox.stat({ path: 'file.txt' })).not.toBeNull();
    });

    it('deleteFile returns false for a missing file', async () => {
      expect(await sandbox.deleteFile({ path: 'missing.txt' })).toBe(false);
    });

    it('deleteFile rejects for a directory', async () => {
      await expect(sandbox.deleteFile({ path: 'dir' })).rejects.toThrow(
        'it is a directory',
      );
      expect(await sandbox.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });

    it('deleteFile rejects for a directory whose name contains "not found"', async () => {
      await sandbox.run({ command: 'mkdir -p "build/not found"' });
      await expect(
        sandbox.deleteFile({ path: 'build/not found' }),
      ).rejects.toThrow('it is a directory');
      expect(await sandbox.stat({ path: 'build/not found' })).not.toBeNull();
    });

    it('deleteFile rejects for a symbolic link to a directory with a trailing slash', async () => {
      await expect(sandbox.deleteFile({ path: 'dir-link/' })).rejects.toThrow(
        'it is a directory',
      );
      expect(
        (await sandbox.listDirectory({ path: '.' }))?.map(entry => entry.name),
      ).toContain('dir-link');
      expect(await sandbox.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });

    it('deleteFile deletes a symbolic link to a directory but not the directory', async () => {
      expect(await sandbox.deleteFile({ path: 'dir-link' })).toBe(true);
      expect(await sandbox.stat({ path: 'dir-link' })).toBeNull();
      expect(await sandbox.stat({ path: 'dir/nested.txt' })).not.toBeNull();
    });
  });

  describe('spawn', () => {
    it('rejects writable stdin before setup or command execution', async () => {
      const nativeSandbox = await Sandbox.create({ cwd: '/work' });
      const runCommand = vi.spyOn(nativeSandbox, 'runCommand');
      const exec = vi.spyOn(nativeSandbox.bashEnvInstance, 'exec');
      const session = new JustBashSandboxSession(nativeSandbox);

      const result = session.spawn({
        command: 'echo unexpected > /work/unexpected.txt',
        stdin: true,
      });

      await expect(result).rejects.toThrow(
        'just-bash does not support writable stdin.',
      );
      expect(runCommand).not.toHaveBeenCalled();
      expect(exec).not.toHaveBeenCalled();
      expect(
        await session.readTextFile({ path: '/work/unexpected.txt' }),
      ).toBeNull();
    });

    it.each([undefined, false])(
      'omits stdin when the option is %s',
      async stdin => {
        const proc = await sandbox.spawn({
          command: 'echo hello',
          ...(stdin === undefined ? {} : { stdin }),
        });

        expect(proc).not.toHaveProperty('stdin');
        expect(await collect(proc.stdout)).toBe('hello\n');
        expect(await proc.wait()).toEqual({ exitCode: 0 });
      },
    );

    it('preserves a pre-aborted signal when writable stdin is requested', async () => {
      const ac = new AbortController();
      const error = new Error('already cancelled');
      ac.abort(error);

      await expect(
        sandbox.spawn({ command: 'cat', stdin: true, abortSignal: ac.signal }),
      ).rejects.toBe(error);
    });

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
