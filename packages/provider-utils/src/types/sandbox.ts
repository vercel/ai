/**
 * Sandbox environment that can execute commands and read/write files.
 */
export type Experimental_Sandbox = {
  /**
   * Description of the sandbox environment that can be added to the agent's instructions
   * so that the agent knows about relevant details such as the root directory, exposed
   * ports, the public hostname, etc.
   */
  readonly description: string;

  /**
   * Run a command in the sandbox.
   */
  readonly runCommand: (options: {
    /**
     * Command to execute in the sandbox.
     */
    command: string;

    /**
     * Working directory to execute the command in.
     */
    workingDirectory?: string;

    /**
     * Signal that can be used to abort the command.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<{
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

  /**
   * Read one file from the sandbox as a stream of bytes. Resolves to `null`
   * when the file does not exist.
   *
   * Relative path handling is implementation-defined. This is the lowest-level
   * read primitive; prefer `readBinaryFile` or `readTextFile` unless you need
   * to stream bytes.
   */
  readonly readFile: (options: {
    /**
     * Path of the file to read.
     */
    path: string;

    /**
     * Signal that can be used to abort the read.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<ReadableStream<Uint8Array> | null>;

  /**
   * Read one file from the sandbox as raw bytes. Resolves to `null` when the
   * file does not exist.
   */
  readonly readBinaryFile: (options: {
    /**
     * Path of the file to read.
     */
    path: string;

    /**
     * Signal that can be used to abort the read.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<Uint8Array | null>;

  /**
   * Read one text file from the sandbox, decoded using the requested encoding.
   * Resolves to `null` when the file does not exist.
   *
   * Line ranges are 1-based and inclusive. When `endLine` is past EOF the read
   * returns through EOF without error.
   */
  readonly readTextFile: (options: {
    /**
     * Path of the file to read.
     */
    path: string;

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

    /**
     * Signal that can be used to abort the read.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<string | null>;

  /**
   * Write one file to the sandbox from a stream of bytes. Creates parent
   * directories recursively and overwrites any existing file.
   *
   * This is the lowest-level write primitive; prefer `writeBinaryFile` or
   * `writeTextFile` when the full content is already materialized in memory.
   */
  readonly writeFile: (options: {
    /**
     * Path of the file to write.
     */
    path: string;

    /**
     * Stream of bytes to write.
     */
    content: ReadableStream<Uint8Array>;

    /**
     * Signal that can be used to abort the write.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<void>;

  /**
   * Write one file to the sandbox from raw bytes. Creates parent directories
   * recursively and overwrites any existing file.
   */
  readonly writeBinaryFile: (options: {
    /**
     * Path of the file to write.
     */
    path: string;

    /**
     * Raw bytes to write.
     */
    content: Uint8Array;

    /**
     * Signal that can be used to abort the write.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<void>;

  /**
   * Write one file to the sandbox from a string, encoded using the requested
   * encoding. Creates parent directories recursively and overwrites any
   * existing file.
   */
  readonly writeTextFile: (options: {
    /**
     * Path of the file to write.
     */
    path: string;

    /**
     * Text content to write.
     */
    content: string;

    /**
     * Text encoding used to encode the string to bytes. Defaults to `"utf-8"`.
     */
    encoding?: string;

    /**
     * Signal that can be used to abort the write.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<void>;

  /**
   * Spawn a long-running process in the sandbox. Returns immediately with a
   * handle that streams stdout/stderr, can be waited on, and can be killed.
   *
   * `runCommand` is conceptually a thin wrapper over this primitive: spawn,
   * collect both streams to strings, await `wait()`, return the result.
   */
  readonly spawnCommand: (options: {
    /**
     * Command to execute in the sandbox.
     */
    command: string;

    /**
     * Working directory to execute the command in.
     */
    workingDirectory?: string;

    /**
     * Signal that can be used to abort the process. When aborted, the process
     * is killed and `wait()` rejects with the abort reason.
     */
    abortSignal?: AbortSignal;
  }) => PromiseLike<Experimental_SandboxProcess>;
};

/**
 * Handle to a long-running process started via `Experimental_Sandbox.spawnCommand`.
 */
export type Experimental_SandboxProcess = {
  /**
   * Process identifier, if the sandbox implementation exposes one.
   */
  readonly pid?: number;

  /**
   * Stream the process reads as standard input. Optional — sandboxes that
   * cannot expose a writable stdin omit this field. Callers that need to
   * push data into a running process must check for its presence and fall
   * back to a side channel (e.g. files in the sandbox filesystem) when it
   * is absent.
   */
  readonly stdin?: WritableStream<Uint8Array>;

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
