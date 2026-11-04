/**
 * Options for executing a command in the sandbox via `run` or `spawn`.
 */
type SandboxProcessOptions = {
  /**
   * Command to execute in the sandbox.
   */
  command: string;

  /**
   * Working directory to execute the command in.
   */
  workingDirectory?: string;

  /**
   * Environment variables to set for this command. Merged with the
   * sandbox's default environment; values here take precedence.
   * Supporting environment variables as an option is preferable from a
   * security perspective, e.g. to avoid them leaking in logs.
   */
  env?: Record<string, string>;

  /**
   * Signal that can be used to abort the command. When aborted, the running
   * process is killed; for `spawn`, `wait()` rejects with the abort reason.
   */
  abortSignal?: AbortSignal;
};

export type SandboxRunOptions = SandboxProcessOptions;

export type SandboxSpawnOptions = SandboxProcessOptions & {
  stdin?: boolean;
};

export type SandboxSpawnOptionsWithStdin = SandboxProcessOptions & {
  stdin: true;
};

export type SandboxSpawnOptionsWithoutStdin = SandboxProcessOptions & {
  stdin?: false;
};

/**
 * Options for reading, inspecting, or deleting one path in the sandbox.
 */
type PathOptions = {
  /**
   * Path to operate on.
   */
  path: string;

  /**
   * Signal that can be used to abort the operation.
   */
  abortSignal?: AbortSignal;
};

export type SandboxReadFileOptions = PathOptions;

export type SandboxReadBinaryFileOptions = PathOptions;

export type SandboxReadTextFileOptions = PathOptions & {
  /**
   * Text encoding used to decode the file bytes. Defaults to `"utf-8"`.
   */
  encoding?: string;

  /**
   * 1-based inclusive start line. Defaults to 1.
   */
  startLine?: number;

  /**
   * 1-based inclusive end line. When past the file's line count, the read
   * returns through EOF without error.
   */
  endLine?: number;
};

export type SandboxStatOptions = PathOptions;

export type SandboxListDirectoryOptions = PathOptions;

export type SandboxDeleteFileOptions = PathOptions;

/**
 * Information about a file or directory in the sandbox, returned by
 * `SandboxSession.stat`. Symbolic links are followed.
 */
export type SandboxFileStat = {
  /**
   * Type of the path. `other` covers devices, sockets, and named pipes.
   */
  type: 'file' | 'directory' | 'other';

  /**
   * Size in bytes. The size of a directory is implementation-defined.
   */
  size: number;
};

/**
 * Entry in a directory listing, returned by `SandboxSession.listDirectory`.
 */
export type SandboxDirectoryEntry = {
  /**
   * Name of the entry, without the directory path.
   */
  name: string;

  /**
   * Type of the entry. Symbolic links are reported as `symlink` and not
   * followed. `other` covers devices, sockets, and named pipes.
   */
  type: 'file' | 'directory' | 'symlink' | 'other';
};

/**
 * Options for writing a file to the sandbox. `CONTENT` is the payload written
 * to the file: a byte stream, raw bytes, or a string.
 */
type WriteFileOptions<CONTENT> = {
  /**
   * Path of the file to write.
   */
  path: string;

  /**
   * Content to write to the file.
   */
  content: CONTENT;

  /**
   * Signal that can be used to abort the write.
   */
  abortSignal?: AbortSignal;
};

export type SandboxWriteFileOptions = WriteFileOptions<
  ReadableStream<Uint8Array>
>;

export type SandboxWriteBinaryFileOptions = WriteFileOptions<Uint8Array>;

export type SandboxWriteTextFileOptions = WriteFileOptions<string> & {
  /**
   * Text encoding used to encode the string to bytes. Defaults to `"utf-8"`.
   */
  encoding?: string;
};

/**
 * Sandbox session that can execute commands and read/write files.
 *
 * Relative paths in every method, including the `workingDirectory` option of
 * `run` and `spawn`, resolve against the same base directory: the directory
 * that `run` and `spawn` start in when no `workingDirectory` is given. The
 * base directory does not change for the lifetime of the session; changing
 * the directory inside a command, e.g. with `cd`, only affects that command.
 * Absolute paths are used as is.
 */
export type SandboxSession = {
  /**
   * Description of the sandbox environment that can be added to the agent's instructions
   * so that the agent knows about relevant details such as the root directory, exposed
   * ports, the public hostname, etc.
   */
  readonly description: string;

  /**
   * Read one file from the sandbox as a stream of bytes. Resolves to `null`
   * when the file does not exist.
   *
   * This is the lowest-level read primitive; prefer `readBinaryFile` or
   * `readTextFile` unless you need to stream bytes.
   */
  readonly readFile: (
    options: SandboxReadFileOptions,
  ) => PromiseLike<ReadableStream<Uint8Array> | null>;

  /**
   * Read one file from the sandbox as raw bytes. Resolves to `null` when the
   * file does not exist.
   */
  readonly readBinaryFile: (
    options: SandboxReadBinaryFileOptions,
  ) => PromiseLike<Uint8Array | null>;

  /**
   * Read one text file from the sandbox, decoded using the requested encoding.
   * Resolves to `null` when the file does not exist.
   *
   * Line ranges are 1-based and inclusive. When `endLine` is past EOF the read
   * returns through EOF without error.
   */
  readonly readTextFile: (
    options: SandboxReadTextFileOptions,
  ) => PromiseLike<string | null>;

  /**
   * Write one file to the sandbox from a stream of bytes. Creates parent
   * directories recursively and overwrites any existing file. Rejects when the
   * path is a directory.
   *
   * This is the lowest-level write primitive; prefer `writeBinaryFile` or
   * `writeTextFile` when the full content is already materialized in memory.
   */
  readonly writeFile: (options: SandboxWriteFileOptions) => PromiseLike<void>;

  /**
   * Write one file to the sandbox from raw bytes. Creates parent directories
   * recursively and overwrites any existing file. Rejects when the path is a
   * directory.
   */
  readonly writeBinaryFile: (
    options: SandboxWriteBinaryFileOptions,
  ) => PromiseLike<void>;

  /**
   * Write one file to the sandbox from a string, encoded using the requested
   * encoding. Creates parent directories recursively and overwrites any
   * existing file. Rejects when the path is a directory.
   */
  readonly writeTextFile: (
    options: SandboxWriteTextFileOptions,
  ) => PromiseLike<void>;

  /**
   * Get information about a file or directory. Symbolic links are followed.
   * Resolves to `null` when the path does not exist.
   */
  readonly stat: (
    options: SandboxStatOptions,
  ) => PromiseLike<SandboxFileStat | null>;

  /**
   * List the entries of one directory, without descending into
   * subdirectories. The order of entries is unspecified. Resolves to `null`
   * when the directory does not exist and rejects when the path is not a
   * directory.
   */
  readonly listDirectory: (
    options: SandboxListDirectoryOptions,
  ) => PromiseLike<Array<SandboxDirectoryEntry> | null>;

  /**
   * Delete one file. A symbolic link is deleted itself, not its target.
   * Resolves to `true` when the file was deleted and `false` when it does not
   * exist. Rejects when the path is a directory.
   */
  readonly deleteFile: (
    options: SandboxDeleteFileOptions,
  ) => PromiseLike<boolean>;

  /**
   * Spawn a long-running process in the sandbox. Returns immediately with a
   * handle that streams stdout/stderr, can be waited on, and can be killed.
   *
   * `run` is conceptually a thin wrapper over this primitive: spawn,
   * collect both streams to strings, await `wait()`, return the result.
   *
   * Set `stdin` to `true` to keep standard input open and expose a writable
   * stream on the returned handle. Implementations that do not support writable
   * stdin must reject before starting the command. When omitted or `false`,
   * standard input is closed and the handle has no `stdin` property.
   */
  readonly spawn: {
    (
      options: SandboxSpawnOptionsWithStdin,
    ): PromiseLike<WritableSandboxProcess>;
    (options: SandboxSpawnOptionsWithoutStdin): PromiseLike<SandboxProcess>;
    (
      options: SandboxSpawnOptions,
    ): PromiseLike<SandboxProcess | WritableSandboxProcess>;
  };

  /**
   * Run a command in the sandbox.
   */
  readonly run: (options: SandboxRunOptions) => PromiseLike<{
    /**
     * Exit code returned by the command.
     */
    exitCode: number;

    /**
     * Standard output produced by the command.
     */
    stdout: string;

    /**
     * Standard error produced by the command.
     */
    stderr: string;
  }>;
};

/**
 * Handle to a long-running process started via `SandboxSession.spawn`.
 */
export type SandboxProcess = {
  /**
   * Process identifier, if the sandbox implementation exposes one.
   */
  readonly pid?: number;

  /**
   * Stream of bytes written by the process to standard output.
   */
  readonly stdout: ReadableStream<Uint8Array>;

  /**
   * Stream of bytes written by the process to standard error.
   */
  readonly stderr: ReadableStream<Uint8Array>;

  /**
   * Resolve when the process exits, yielding its exit code.
   */
  wait(): PromiseLike<{ exitCode: number }>;

  /**
   * Terminate the process. Idempotent.
   */
  kill(): PromiseLike<void>;
};

export type WritableSandboxProcess = SandboxProcess & {
  /**
   * Stream of bytes written to the process's standard input. Closing the stream
   * delivers EOF after pending writes without terminating the process.
   */
  readonly stdin: WritableStream<Uint8Array>;
};
