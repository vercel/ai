import { posix } from 'node:path';
import {
  extractLines,
  type Experimental_SandboxDirectoryEntry as SandboxDirectoryEntry,
  type Experimental_SandboxFileStat as SandboxFileStat,
  type Experimental_SandboxRunOptions as RunOptions,
  type Experimental_SandboxReadFileOptions as ReadFileOptions,
  type Experimental_SandboxReadBinaryFileOptions as ReadBinaryFileOptions,
  type Experimental_SandboxReadTextFileOptions as ReadTextFileOptions,
  type Experimental_SandboxWriteFileOptions as WriteFileOptions,
  type Experimental_SandboxWriteBinaryFileOptions as WriteBinaryFileOptions,
  type Experimental_SandboxWriteTextFileOptions as WriteTextFileOptions,
  type Experimental_SandboxStatOptions as StatOptions,
  type Experimental_SandboxListDirectoryOptions as ListDirectoryOptions,
  type Experimental_SandboxDeleteFileOptions as DeleteFileOptions,
  type Experimental_SandboxSession as SandboxSession,
  type Experimental_SandboxProcess as SandboxProcess,
  type Experimental_SandboxSpawnOptions as SpawnOptions,
  type Experimental_SandboxSpawnOptionsWithStdin as SpawnOptionsWithStdin,
  type Experimental_SandboxSpawnOptionsWithoutStdin as SpawnOptionsWithoutStdin,
  type Experimental_WritableSandboxProcess as WritableSandboxProcess,
} from '@ai-sdk/provider-utils';
import type { Sandbox, Command } from '@vercel/sandbox';

// Distinct from the exit codes bash and coreutils use for their own errors.
const NOT_FOUND_EXIT_CODE = 3;
const WRONG_TYPE_EXIT_CODE = 4;

// The path methods run these scripts instead of using `sandbox.fs`, which
// reports every error other than "No such file or directory" as `EACCES` (so a
// path under a file rejects instead of being missing) and passes paths without
// `--` (so a path starting with `-` is read as an option).
// TODO: replace the scripts with native Vercel Sandbox SDK APIs when available.

// `[ -e ]` is false both for missing paths and for paths that cannot be
// resolved (permissions, symbolic link loops), so open the path to get the
// reason. Not `stat -L`, because BSD `stat -L` succeeds for a broken link.
// The error message ends with the reason; the path before it is user-supplied.
const EXIT_MISSING_FUNCTION = `
exit_missing() {
  error=$(LC_ALL=C; : 2>&1 < "$1")
  case $error in
    *": No such file or directory" | *": Not a directory") exit ${NOT_FOUND_EXIT_CODE} ;;
  esac
  echo "\${error:-Cannot access $1}" >&2
  exit 1
}
`;

// Paths are passed as `$1` so they aren't interpolated into the script
// `stat -f` is the fallback for BSD `stat`.
const STAT_SCRIPT = `${EXIT_MISSING_FUNCTION}
[ -e "$1" ] || exit_missing "$1"
if [ -f "$1" ]; then type=file; elif [ -d "$1" ]; then type=directory; else type=other; fi
size=$(stat -L -c %s -- "$1" 2>/dev/null || stat -L -f %z -- "$1") || exit 1
printf '%s %s' "$type" "$size"
`;

// Not `sandbox.fs.readdir`, which separates entries with newlines and splits
// type from name on `|`, so names containing either are listed wrong.
// `cd -P` so that `link/..` lists the same directory `[ -d ]` checked, and
// `./` so that `CDPATH` and a directory named `-` are not special. `nullglob`
// would list an unreadable directory as empty, so check `-r` first.
const LIST_DIRECTORY_SCRIPT = `${EXIT_MISSING_FUNCTION}
if [ ! -d "$1" ]; then
  [ -e "$1" ] || exit_missing "$1"
  echo "Not a directory" >&2
  exit ${WRONG_TYPE_EXIT_CODE}
fi
case $1 in /*) dir=$1 ;; *) dir=./$1 ;; esac
cd -P -- "$dir" || exit 1
[ -r . ] || { echo "Permission denied" >&2; exit 1; }
shopt -s dotglob nullglob
for name in *; do
  if [ -L "$name" ]; then type=symlink
  elif [ -f "$name" ]; then type=file
  elif [ -d "$name" ]; then type=directory
  else type=other
  fi
  printf '%s %s\\0' "$type" "$name"
done
`;

// Not `sandbox.fs.unlink`, which also reports a directory as `EACCES`, so it
// cannot be told apart from other errors.
// delete the symlink itself even when it points to a dir or to a file or to nothing
const DELETE_FILE_SCRIPT = `${EXIT_MISSING_FUNCTION}
if [ -d "$1" ] && [ ! -L "$1" ]; then
  echo "Is a directory" >&2
  exit ${WRONG_TYPE_EXIT_CODE}
fi
[ -e "$1" ] || [ -L "$1" ] || exit_missing "$1"
rm -f -- "$1"
`;

/**
 * `Experimental_SandboxSession` implementation backed by a `@vercel/sandbox`
 * `Sandbox` instance. This is the tool-safe surface (file I/O, exec, spawn);
 * it is what `VercelNetworkSandboxSession.restricted()` returns and is not
 * constructed directly by consumers. The network sandbox session owns the
 * lifetime of the underlying sandbox.
 */
export class VercelSandboxSession implements SandboxSession {
  constructor(protected readonly sandbox: Sandbox) {}

  get description(): string {
    return [
      `Vercel Sandbox (name: ${this.sandbox.name}).`,
      'Filesystem changes persist for the lifetime of the sandbox.',
    ].join('\n');
  }

  // Make relative `workingDirectory` absolute
  // - vercel sandbox resolves relative `cwd` against `/` instead of the sandbox's working directory
  // - join paths directly instead of using `posix.join` so that symlinks are followed

  private async resolveWorkingDirectory(
    workingDirectory: string,
    abortSignal: AbortSignal | undefined,
  ): Promise<string> {
    if (posix.isAbsolute(workingDirectory)) return workingDirectory;
    const { cwd } = await this.currentSession(abortSignal);
    return cwd === '/' ? `/${workingDirectory}` : `${cwd}/${workingDirectory}`;
  }

  // `currentSession()` throws until a stopped sandbox is resumed, and
  // `resume()` is private, so run a command, which resumes it.
  // TODO: replace with a native Vercel Sandbox SDK API when available.
  private async currentSession(abortSignal: AbortSignal | undefined) {
    try {
      return this.sandbox.currentSession();
    } catch {
      await this.sandbox.runCommand({
        cmd: 'true',
        ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
      });
      return this.sandbox.currentSession();
    }
  }

  async run({
    command,
    workingDirectory,
    env,
    abortSignal,
  }: RunOptions): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    abortSignal?.throwIfAborted();

    const finished = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      ...(workingDirectory !== undefined
        ? {
            cwd: await this.resolveWorkingDirectory(
              workingDirectory,
              abortSignal,
            ),
          }
        : {}),
      ...(env !== undefined ? { env } : {}),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    });

    const [stdout, stderr] = await Promise.all([
      finished.stdout(),
      finished.stderr(),
    ]);

    return {
      exitCode: finished.exitCode,
      stdout,
      stderr,
    };
  }

  spawn(options: SpawnOptionsWithStdin): Promise<WritableSandboxProcess>;
  spawn(options: SpawnOptionsWithoutStdin): Promise<SandboxProcess>;
  spawn(
    options: SpawnOptions,
  ): Promise<SandboxProcess | WritableSandboxProcess>;
  async spawn({
    command,
    workingDirectory,
    env,
    abortSignal,
    stdin,
  }: SpawnOptions): Promise<SandboxProcess | WritableSandboxProcess> {
    abortSignal?.throwIfAborted();

    const live = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      detached: true,
      ...(stdin === true ? { stdin: true } : {}),
      ...(workingDirectory !== undefined
        ? {
            cwd: await this.resolveWorkingDirectory(
              workingDirectory,
              abortSignal,
            ),
          }
        : {}),
      ...(env !== undefined ? { env } : {}),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    });

    const process = createSandboxProcess({ command: live, abortSignal });
    return stdin === true
      ? {
          ...process,
          stdin: createStdinStream({ command: live, abortSignal }),
        }
      : process;
  }

  async readFile({
    path,
    abortSignal,
  }: ReadFileOptions): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    return bytesToStream(bytes);
  }

  async readBinaryFile({
    path,
    abortSignal,
  }: ReadBinaryFileOptions): Promise<Uint8Array | null> {
    abortSignal?.throwIfAborted();
    try {
      const buffer = await this.sandbox.readFileToBuffer(
        { path },
        abortSignal ? { signal: abortSignal } : undefined,
      );
      if (buffer == null) return null;
      return new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      );
    } catch (error) {
      if (isFileNotFoundError(error)) return null;
      throw error;
    }
  }

  async readTextFile({
    path,
    encoding = 'utf-8',
    startLine,
    endLine,
    abortSignal,
  }: ReadTextFileOptions): Promise<string | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    const text = Buffer.from(bytes).toString(encoding as BufferEncoding);
    return extractLines({ text, startLine, endLine });
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: WriteFileOptions): Promise<void> {
    const bytes = await collectStream(content);
    await this.writeBinaryFile({ path, content: bytes, abortSignal });
  }

  async writeBinaryFile({
    path,
    content,
    abortSignal,
  }: WriteBinaryFileOptions): Promise<void> {
    abortSignal?.throwIfAborted();
    const parent = posix.dirname(path);
    // `sandbox.mkDir` creates only a single directory.
    // TODO: replace with a native Vercel Sandbox SDK API when available.
    if (parent && parent !== '.' && parent !== '/') {
      await this.sandbox.runCommand({
        cmd: 'mkdir',
        args: ['-p', parent],
        ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
      });
    }
    await this.sandbox.writeFiles(
      [{ path, content }],
      abortSignal ? { signal: abortSignal } : undefined,
    );
  }

  async writeTextFile({
    path,
    content,
    encoding = 'utf-8',
    abortSignal,
  }: WriteTextFileOptions): Promise<void> {
    const buffer = Buffer.from(content, encoding as BufferEncoding);
    await this.writeBinaryFile({
      path,
      content: new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      ),
      abortSignal,
    });
  }

  async stat({
    path,
    abortSignal,
  }: StatOptions): Promise<SandboxFileStat | null> {
    const { exitCode, stdout, stderr } = await this.runPathScript({
      script: STAT_SCRIPT,
      path,
      abortSignal,
    });
    if (exitCode === NOT_FOUND_EXIT_CODE) return null;
    if (exitCode !== 0) {
      throw new Error(`Failed to stat ${path}: ${stderr.trim()}`);
    }
    const [type, size] = stdout.split(' ');
    return {
      type: type as SandboxFileStat['type'],
      size: Number(size),
    };
  }

  async listDirectory({
    path,
    abortSignal,
  }: ListDirectoryOptions): Promise<Array<SandboxDirectoryEntry> | null> {
    const { exitCode, stdout, stderr } = await this.runPathScript({
      script: LIST_DIRECTORY_SCRIPT,
      path,
      abortSignal,
    });
    if (exitCode === NOT_FOUND_EXIT_CODE) return null;
    if (exitCode !== 0) {
      throw new Error(`Failed to list ${path}: ${stderr.trim()}`);
    }
    return stdout
      .split('\0')
      .filter(record => record !== '')
      .map(record => {
        const separator = record.indexOf(' ');
        return {
          name: record.slice(separator + 1),
          type: record.slice(0, separator) as SandboxDirectoryEntry['type'],
        };
      });
  }

  async deleteFile({ path, abortSignal }: DeleteFileOptions): Promise<boolean> {
    const { exitCode, stderr } = await this.runPathScript({
      script: DELETE_FILE_SCRIPT,
      path,
      abortSignal,
    });
    if (exitCode === NOT_FOUND_EXIT_CODE) return false;
    if (exitCode === WRONG_TYPE_EXIT_CODE) {
      throw new Error(`Cannot delete ${path}: it is a directory.`);
    }
    if (exitCode !== 0) {
      throw new Error(`Failed to delete ${path}: ${stderr.trim()}`);
    }
    return true;
  }

  private async runPathScript({
    script,
    path,
    abortSignal,
  }: {
    script: string;
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    abortSignal?.throwIfAborted();
    const finished = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', script, 'bash', path],
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    });
    const [stdout, stderr] = await Promise.all([
      finished.stdout(),
      finished.stderr(),
    ]);
    return { exitCode: finished.exitCode, stdout, stderr };
  }
}

function createSandboxProcess({
  command,
  abortSignal,
}: {
  command: Command;
  abortSignal?: AbortSignal;
}): SandboxProcess {
  const encoder = new TextEncoder();
  const controllers: {
    stdout?: ReadableStreamDefaultController<Uint8Array>;
    stderr?: ReadableStreamDefaultController<Uint8Array>;
  } = {};

  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      controllers.stdout = controller;
    },
  });

  const stderr = new ReadableStream<Uint8Array>({
    start(controller) {
      controllers.stderr = controller;
    },
  });

  const removeAbortListener = () =>
    abortSignal?.removeEventListener('abort', onAbort);
  const onAbort = () => {
    removeAbortListener();
    void command.kill().catch(() => {});
  };
  if (abortSignal?.aborted) {
    onAbort();
  } else {
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  }

  const drained = (async () => {
    try {
      const iterator = abortSignal
        ? command.logs({ signal: abortSignal })
        : command.logs();
      for await (const message of iterator) {
        const target =
          message.stream === 'stdout' ? controllers.stdout : controllers.stderr;
        target?.enqueue(encoder.encode(message.data));
      }
      controllers.stdout?.close();
      controllers.stderr?.close();
    } catch (error) {
      controllers.stdout?.error(error);
      controllers.stderr?.error(error);
    }
  })();

  return {
    stdout,
    stderr,
    async wait(): Promise<{ exitCode: number }> {
      try {
        const finished = await (abortSignal
          ? command.wait({ signal: abortSignal })
          : command.wait());
        removeAbortListener();
        await drained;
        abortSignal?.throwIfAborted();
        return { exitCode: finished.exitCode };
      } catch (error) {
        abortSignal?.throwIfAborted();
        throw error;
      }
    },
    async kill(): Promise<void> {
      await command.kill();
      removeAbortListener();
    },
  };
}

function createStdinStream({
  command,
  abortSignal,
}: {
  command: Command;
  abortSignal?: AbortSignal;
}): WritableStream<Uint8Array> {
  let removeAbortListener = () => {};

  return new WritableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        removeAbortListener();
        controller.error(abortSignal?.reason);
      };
      removeAbortListener = () =>
        abortSignal?.removeEventListener('abort', onAbort);
      if (abortSignal?.aborted) {
        onAbort();
      } else {
        abortSignal?.addEventListener('abort', onAbort, { once: true });
      }
    },
    async write(chunk) {
      try {
        await command.writeStdin(chunk, { abortSignal });
      } catch (error) {
        /*
         * A failed write may have delivered only part of the input. Sending
         * EOF could make the process treat that truncated input as complete.
         */
        removeAbortListener();
        throw error;
      }
    },
    async close() {
      try {
        await command.closeStdin({ abortSignal });
      } finally {
        removeAbortListener();
      }
    },
    abort() {
      removeAbortListener();
      return command.closeStdin();
    },
  });
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function isFileNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'ENOENT') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    /no such file|not found|does not exist|ENOENT/i.test(message)
  );
}
