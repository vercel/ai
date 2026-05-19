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
};
