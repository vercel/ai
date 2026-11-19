import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import {
  createTextOutputCapture,
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
import type { ContainerProcess, Sandbox } from 'modal';
import { isModalError } from './utils';

/**
 * Runs the command as a background job in its own process group and records
 * the job's process ID, because Modal cannot signal a process it started.
 * Job control is only needed to start the job; leaving it on would print job
 * status lines to stderr. `$1` is the process ID file and `$2` is the command.
 * With job control on, the job shares this script's standard input, which is
 * the one Modal writes to, unless it is redirected.
 */
function createSpawnScript({ stdin }: { stdin: boolean }): string {
  return [
    'set -m',
    `bash -c "$2"${stdin ? '' : ' < /dev/null'} &`,
    'child=$!',
    'set +m',
    'echo "$child" > "$1"',
    'wait "$child"',
    'code=$?',
    'rm -f "$1"',
    'exit "$code"',
  ].join('\n');
}

/**
 * Terminates the process group recorded in the process ID file `$1`, falling
 * back to the process itself. A missing file means the process has exited.
 */
const KILL_SCRIPT = [
  'for attempt in 1 2 3 4 5 6 7 8 9 10; do',
  '  [ -s "$1" ] && break',
  '  sleep 0.1',
  'done',
  'child="$(cat "$1" 2>/dev/null)"',
  '[ -n "$child" ] || exit 0',
  'kill -TERM -- "-$child" 2>/dev/null || kill -TERM "$child" 2>/dev/null',
  'exit 0',
].join('\n');

// Distinct from the exit codes bash and coreutils use for their own errors.
const NOT_FOUND_EXIT_CODE = 3;
const WRONG_TYPE_EXIT_CODE = 4;

// The path methods run these scripts instead of using `sandbox.filesystem`:
// its `stat()` does not follow symbolic links, it reports every path as a
// file, a directory, or a symbolic link, and its `remove()` deletes empty
// directories. Paths are passed as `$1` so they aren't interpolated into the
// scripts, and they are absolute.

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

// `stat -f` is the fallback for BSD `stat`.
const STAT_SCRIPT = `${EXIT_MISSING_FUNCTION}
[ -e "$1" ] || exit_missing "$1"
if [ -f "$1" ]; then type=file; elif [ -d "$1" ]; then type=directory; else type=other; fi
size=$(stat -L -c %s -- "$1" 2>/dev/null || stat -L -f %z -- "$1") || exit 1
printf '%s %s' "$type" "$size"
`;

// `cd -P` so that `link/..` lists the same directory `[ -d ]` checked.
// `nullglob` would list an unreadable directory as empty, so check `-r` first.
const LIST_DIRECTORY_SCRIPT = `${EXIT_MISSING_FUNCTION}
if [ ! -d "$1" ]; then
  [ -e "$1" ] || exit_missing "$1"
  echo "Not a directory" >&2
  exit ${WRONG_TYPE_EXIT_CODE}
fi
cd -P -- "$1" || exit 1
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

// A symbolic link is deleted itself, whatever it points to.
const DELETE_FILE_SCRIPT = `${EXIT_MISSING_FUNCTION}
if [ -d "$1" ] && [ ! -L "$1" ]; then
  echo "Is a directory" >&2
  exit ${WRONG_TYPE_EXIT_CODE}
fi
[ -e "$1" ] || [ -L "$1" ] || exit_missing "$1"
rm -f -- "$1"
`;

/**
 * `Experimental_SandboxSession` implementation backed by a `modal` `Sandbox`
 * instance. This is the tool-safe surface (file I/O, exec, spawn); it is what
 * `ModalNetworkSandboxSession.restricted()` returns and is not constructed
 * directly by consumers. The network sandbox session owns the lifetime of the
 * underlying sandbox.
 */
export class ModalSandboxSession implements SandboxSession {
  constructor(
    protected readonly sandbox: Sandbox,
    protected readonly workingDirectory: string,
  ) {}

  get description(): string {
    return [
      `Modal Sandbox (ID: ${this.sandbox.sandboxId}).`,
      `Working directory: ${this.workingDirectory}`,
      'Filesystem changes persist for the lifetime of the sandbox.',
    ].join('\n');
  }

  async run({
    command,
    workingDirectory,
    env,
    abortSignal,
    maxOutputLength,
  }: RunOptions): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    stdoutLength?: number;
    stderrLength?: number;
  }> {
    // Created first so that an invalid limit rejects before the command starts.
    const stdoutCapture =
      maxOutputLength === undefined
        ? undefined
        : createTextOutputCapture({ maxLength: maxOutputLength });
    const stderrCapture =
      maxOutputLength === undefined
        ? undefined
        : createTextOutputCapture({ maxLength: maxOutputLength });

    const process = await this.spawn({
      command,
      workingDirectory,
      env,
      abortSignal,
    });

    if (stdoutCapture === undefined || stderrCapture === undefined) {
      const [stdout, stderr, { exitCode }] = await Promise.all([
        collectText(process.stdout),
        collectText(process.stderr),
        process.wait(),
      ]);
      return { exitCode, stdout, stderr };
    }

    // Output is decoded as it arrives and only the capped prefix is kept, so
    // the command runs to completion without its full output held in memory.
    const [{ exitCode }] = await Promise.all([
      process.wait(),
      captureText({ stream: process.stdout, capture: stdoutCapture }),
      captureText({ stream: process.stderr, capture: stderrCapture }),
    ]);
    return {
      exitCode,
      stdout: stdoutCapture.text,
      stderr: stderrCapture.text,
      stdoutLength: stdoutCapture.length,
      stderrLength: stderrCapture.length,
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

    const processIdFile = `/tmp/.ai-sdk-sandbox-${randomUUID()}.pid`;
    const script = createSpawnScript({ stdin: stdin === true });
    const nativeProcess = await this.sandbox.exec(
      ['bash', '-c', script, 'bash', processIdFile, command],
      {
        mode: 'binary',
        workdir:
          workingDirectory !== undefined
            ? this.resolvePath(workingDirectory)
            : this.workingDirectory,
        ...(env !== undefined ? { env } : {}),
      },
    );

    const process = createSandboxProcess({
      sandbox: this.sandbox,
      process: nativeProcess,
      processIdFile,
      abortSignal,
    });
    return stdin === true
      ? {
          ...process,
          stdin: createStdinStream({ process: nativeProcess, abortSignal }),
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
      return await this.sandbox.filesystem.readBytes(this.resolvePath(path));
    } catch (error) {
      if (isModalError(error, 'SandboxFilesystemNotFoundError')) return null;
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
    // Modal creates missing parent directories, overwrites existing files, and
    // rejects a path that is a directory.
    await this.sandbox.filesystem.writeBytes(content, this.resolvePath(path));
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
    const process = await this.sandbox.exec(
      ['bash', '-c', script, 'bash', this.resolvePath(path)],
      { mode: 'binary' },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      collectText(process.stdout),
      collectText(process.stderr),
      process.wait(),
    ]);
    abortSignal?.throwIfAborted();
    return { exitCode, stdout, stderr };
  }

  /**
   * Modal only accepts absolute paths, so relative paths resolve against the
   * sandbox working directory. Paths are joined instead of normalized so that
   * `..` after a symbolic link and a trailing slash keep their meaning.
   */
  private resolvePath(path: string): string {
    if (posix.isAbsolute(path)) return path;
    return this.workingDirectory === '/'
      ? `/${path}`
      : `${this.workingDirectory}/${path}`;
  }
}

function createSandboxProcess({
  sandbox,
  process,
  processIdFile,
  abortSignal,
}: {
  sandbox: Sandbox;
  process: ContainerProcess<Uint8Array>;
  processIdFile: string;
  abortSignal: AbortSignal | undefined;
}): SandboxProcess {
  let exited = false;
  const exit = process.wait().finally(() => {
    exited = true;
  });
  // Reported through `wait()`; an unobserved process must not crash the host.
  exit.catch(() => {});

  const kill = async (): Promise<void> => {
    if (exited) return;
    const killer = await sandbox.exec(
      ['bash', '-c', KILL_SCRIPT, 'bash', processIdFile],
      { stdout: 'ignore', stderr: 'ignore' },
    );
    await killer.wait();
  };

  const abortProcess = () => void kill().catch(() => {});
  if (abortSignal?.aborted) {
    abortProcess();
  } else {
    abortSignal?.addEventListener('abort', abortProcess, { once: true });
  }

  return {
    stdout: process.stdout,
    stderr: process.stderr,
    async wait(): Promise<{ exitCode: number }> {
      try {
        const exitCode = await exit;
        if (abortSignal?.aborted) {
          throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        return { exitCode };
      } finally {
        abortSignal?.removeEventListener('abort', abortProcess);
      }
    },
    kill,
  };
}

function createStdinStream({
  process,
  abortSignal,
}: {
  process: ContainerProcess<Uint8Array>;
  abortSignal: AbortSignal | undefined;
}): WritableStream<Uint8Array> {
  const writer = process.stdin.getWriter();
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
        await writer.write(chunk);
      } catch (error) {
        // A failed write may have delivered only part of the input. Sending
        // EOF could make the process treat that truncated input as complete.
        removeAbortListener();
        throw error;
      }
    },
    async close() {
      try {
        await writer.close();
      } finally {
        removeAbortListener();
      }
    },
    abort() {
      removeAbortListener();
      return writer.close();
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

async function collectText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  return new TextDecoder().decode(await collectStream(stream));
}

async function captureText({
  stream,
  capture,
}: {
  stream: ReadableStream<Uint8Array>;
  capture: { append(chunk: string): void };
}): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) capture.append(decoder.decode(value, { stream: true }));
  }
  capture.append(decoder.decode());
}
