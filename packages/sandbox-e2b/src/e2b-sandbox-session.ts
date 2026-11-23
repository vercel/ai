import { posix } from 'node:path';
import {
  createTextOutputCapture,
  extractLines,
  type Experimental_SandboxDeleteFileOptions as DeleteFileOptions,
  type Experimental_SandboxDirectoryEntry as SandboxDirectoryEntry,
  type Experimental_SandboxFileStat as SandboxFileStat,
  type Experimental_SandboxListDirectoryOptions as ListDirectoryOptions,
  type Experimental_SandboxProcess as SandboxProcess,
  type Experimental_SandboxReadBinaryFileOptions as ReadBinaryFileOptions,
  type Experimental_SandboxReadFileOptions as ReadFileOptions,
  type Experimental_SandboxReadTextFileOptions as ReadTextFileOptions,
  type Experimental_SandboxRunOptions as RunOptions,
  type Experimental_SandboxSession as SandboxSession,
  type Experimental_SandboxSpawnOptions as SpawnOptions,
  type Experimental_SandboxSpawnOptionsWithStdin as SpawnOptionsWithStdin,
  type Experimental_SandboxSpawnOptionsWithoutStdin as SpawnOptionsWithoutStdin,
  type Experimental_SandboxStatOptions as StatOptions,
  type Experimental_SandboxWriteBinaryFileOptions as WriteBinaryFileOptions,
  type Experimental_SandboxWriteFileOptions as WriteFileOptions,
  type Experimental_SandboxWriteTextFileOptions as WriteTextFileOptions,
  type Experimental_WritableSandboxProcess as WritableSandboxProcess,
} from '@ai-sdk/provider-utils';
import {
  CommandExitError,
  FileNotFoundError,
  type CommandHandle,
  type Sandbox,
} from 'e2b';

// Distinct from the exit codes bash and coreutils use for their own errors.
const NOT_FOUND_EXIT_CODE = 3;
const WRONG_TYPE_EXIT_CODE = 4;

// Environment variable that carries the path into the scripts below. E2B runs
// a command from a single string, so this keeps the path out of the script.
const PATH_VARIABLE = 'AI_SDK_SANDBOX_PATH';

// The path methods run these scripts instead of using `sandbox.files`, because
// `files.list` skips sockets, named pipes, and devices, `files.getInfo` does
// not document whether it follows symbolic links, and `files.remove` also
// removes directories and does not report whether the path existed.

// `[ -e ]` is false both for missing paths and for paths that cannot be
// resolved (permissions, symbolic link loops), so open the path to get the
// reason. The error message ends with the reason; the path before it is
// user-supplied.
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

// Deletes a symbolic link itself, whatever it points to.
const DELETE_FILE_SCRIPT = `${EXIT_MISSING_FUNCTION}
if [ -d "$1" ] && [ ! -L "$1" ]; then
  echo "Is a directory" >&2
  exit ${WRONG_TYPE_EXIT_CODE}
fi
[ -e "$1" ] || [ -L "$1" ] || exit_missing "$1"
rm -f -- "$1"
`;

/**
 * `Experimental_SandboxSession` implementation backed by an `e2b` `Sandbox`
 * instance. This is the tool-safe surface (file I/O, exec, spawn); it is what
 * `E2BNetworkSandboxSession.restricted()` returns. The network sandbox session
 * owns the lifetime of the underlying sandbox.
 *
 * Commands run in the working directory by default and relative file paths
 * resolve against it.
 */
export class E2BSandboxSession implements SandboxSession {
  constructor(
    protected readonly sandbox: Sandbox,
    protected readonly workingDirectory: string,
  ) {}

  get description(): string {
    return [
      `E2B Sandbox (ID: ${this.sandbox.sandboxId}).`,
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
    abortSignal?.throwIfAborted();

    // E2B's command handle keeps the complete output of a running command
    // itself, so the cap bounds what this method returns, not that buffer.
    const capture =
      maxOutputLength === undefined
        ? undefined
        : {
            stdout: createTextOutputCapture({ maxLength: maxOutputLength }),
            stderr: createTextOutputCapture({ maxLength: maxOutputLength }),
          };

    const handle = await this.startCommand({
      command,
      workingDirectory,
      env,
      abortSignal,
      ...(capture !== undefined
        ? {
            onStdout: data => capture.stdout.append(data),
            onStderr: data => capture.stderr.append(data),
          }
        : {}),
    });
    const stopKillingOnAbort = killOnAbort(handle, abortSignal);
    try {
      const finished = await waitForCommand(handle);
      abortSignal?.throwIfAborted();
      if (capture === undefined) return finished;
      // E2B calls the output callbacks for every chunk before `wait()`
      // settles, so the captures have seen all of the command's output.
      return {
        exitCode: finished.exitCode,
        stdout: capture.stdout.text,
        stderr: capture.stderr.text,
        stdoutLength: capture.stdout.length,
        stderrLength: capture.stderr.length,
      };
    } catch (error) {
      abortSignal?.throwIfAborted();
      throw error;
    } finally {
      stopKillingOnAbort();
    }
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

    const encoder = new TextEncoder();
    const output = createOutputStreams();
    const handle = await this.startCommand({
      command,
      workingDirectory,
      env,
      abortSignal,
      stdin,
      onStdout: data => output.enqueue('stdout', encoder.encode(data)),
      onStderr: data => output.enqueue('stderr', encoder.encode(data)),
    });
    const stopKillingOnAbort = killOnAbort(handle, abortSignal);

    const finished = waitForCommand(handle).then(
      result => {
        abortSignal?.throwIfAborted();
        return { exitCode: result.exitCode };
      },
      error => {
        abortSignal?.throwIfAborted();
        throw error;
      },
    );
    finished
      .then(
        () => output.close(),
        error => output.error(error),
      )
      .finally(stopKillingOnAbort);

    const process: SandboxProcess = {
      stdout: output.stdout,
      stderr: output.stderr,
      wait: () => finished,
      async kill(): Promise<void> {
        await handle.kill();
      },
    };
    return stdin === true
      ? { ...process, stdin: createStdinStream({ handle, abortSignal }) }
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
      return await this.sandbox.files.read(this.resolvePath(path), {
        format: 'bytes',
        ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
      });
    } catch (error) {
      if (error instanceof FileNotFoundError) return null;
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
    abortSignal?.throwIfAborted();
    // E2B creates the missing parent directories and streams the upload.
    await this.sandbox.files.write(
      this.resolvePath(path),
      content,
      abortSignal ? { signal: abortSignal } : undefined,
    );
  }

  async writeBinaryFile({
    path,
    content,
    abortSignal,
  }: WriteBinaryFileOptions): Promise<void> {
    abortSignal?.throwIfAborted();
    await this.sandbox.files.write(
      this.resolvePath(path),
      new Blob([content as Uint8Array<ArrayBuffer>]),
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

  private runPathScript({
    script,
    path,
    abortSignal,
  }: {
    script: string;
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return this.run({
      command: `set -- "$${PATH_VARIABLE}"\n${script}`,
      env: { [PATH_VARIABLE]: path },
      abortSignal,
    });
  }

  // Joined without normalizing, so that `link/..` and a trailing slash reach
  // the sandbox, which resolves them against the real filesystem.
  private resolvePath(path: string): string {
    if (posix.isAbsolute(path)) return path;
    return this.workingDirectory === '/'
      ? `/${path}`
      : `${this.workingDirectory}/${path}`;
  }

  /**
   * Starts a command without waiting for it. E2B runs the command through
   * `bash -l -c`. Its default 60 second command timeout is disabled so that
   * long installs and long-lived processes are not cut off. E2B closes standard
   * input unless `stdin` is `true`.
   */
  private startCommand({
    command,
    workingDirectory = this.workingDirectory,
    env,
    abortSignal,
    stdin,
    onStdout,
    onStderr,
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
    stdin?: boolean;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  }): Promise<CommandHandle> {
    return this.sandbox.commands.run(command, {
      background: true,
      timeoutMs: 0,
      cwd: this.resolvePath(workingDirectory),
      ...(stdin === true ? { stdin: true } : {}),
      ...(env !== undefined ? { envs: env } : {}),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
      ...(onStdout !== undefined ? { onStdout } : {}),
      ...(onStderr !== undefined ? { onStderr } : {}),
    });
  }
}

/**
 * Waits for a command and reports a non-zero exit as a result. E2B's
 * `CommandHandle.wait()` throws `CommandExitError` for it instead.
 */
async function waitForCommand(
  handle: CommandHandle,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { exitCode, stdout, stderr } = await handle.wait();
    return { exitCode, stdout, stderr };
  } catch (error) {
    if (error instanceof CommandExitError) {
      return {
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
      };
    }
    throw error;
  }
}

/**
 * Kills the process when the signal aborts. Aborting only closes the SDK's
 * connection to the command, which leaves the process running in the sandbox.
 */
function killOnAbort(
  handle: CommandHandle,
  abortSignal: AbortSignal | undefined,
): () => void {
  if (abortSignal === undefined) return () => {};
  const kill = () => {
    void handle.kill().catch(() => {});
  };
  if (abortSignal.aborted) {
    kill();
    return () => {};
  }
  abortSignal.addEventListener('abort', kill, { once: true });
  return () => abortSignal.removeEventListener('abort', kill);
}

function createStdinStream({
  handle,
  abortSignal,
}: {
  handle: CommandHandle;
  abortSignal: AbortSignal | undefined;
}): WritableStream<Uint8Array> {
  const requestOptions = abortSignal ? { signal: abortSignal } : undefined;
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
        await handle.sendStdin(chunk, requestOptions);
      } catch (error) {
        // A failed write may have delivered only part of the input. Sending
        // EOF could make the process treat that truncated input as complete.
        removeAbortListener();
        throw error;
      }
    },
    async close() {
      try {
        await handle.closeStdin(requestOptions);
      } finally {
        removeAbortListener();
      }
    },
    abort() {
      removeAbortListener();
      return handle.closeStdin();
    },
  });
}

function createOutputStreams(): {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  enqueue(target: 'stdout' | 'stderr', chunk: Uint8Array): void;
  close(): void;
  error(reason: unknown): void;
} {
  const controllers: {
    stdout?: ReadableStreamDefaultController<Uint8Array>;
    stderr?: ReadableStreamDefaultController<Uint8Array>;
  } = {};
  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      controllers.stdout = controller;
    },
    cancel() {
      controllers.stdout = undefined;
    },
  });
  const stderr = new ReadableStream<Uint8Array>({
    start(controller) {
      controllers.stderr = controller;
    },
    cancel() {
      controllers.stderr = undefined;
    },
  });

  return {
    stdout,
    stderr,
    enqueue(target, chunk) {
      controllers[target]?.enqueue(chunk);
    },
    close() {
      controllers.stdout?.close();
      controllers.stderr?.close();
      controllers.stdout = undefined;
      controllers.stderr = undefined;
    },
    error(reason) {
      controllers.stdout?.error(reason);
      controllers.stderr?.error(reason);
      controllers.stdout = undefined;
      controllers.stderr = undefined;
    },
  };
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
