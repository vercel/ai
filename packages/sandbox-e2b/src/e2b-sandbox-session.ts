import { posix } from 'node:path';
import {
  extractLines,
  type Experimental_SandboxSession as SandboxSession,
  type Experimental_SandboxProcess as SandboxProcess,
} from '@ai-sdk/provider-utils';
import {
  CommandExitError,
  FileNotFoundError,
  type CommandHandle,
  type Sandbox,
} from 'e2b';

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
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    abortSignal?.throwIfAborted();

    const handle = await this.startCommand({
      command,
      workingDirectory,
      env,
      abortSignal,
    });
    const stopKillingOnAbort = killOnAbort(handle, abortSignal);
    try {
      const finished = await waitForCommand(handle);
      abortSignal?.throwIfAborted();
      return finished;
    } catch (error) {
      abortSignal?.throwIfAborted();
      throw error;
    } finally {
      stopKillingOnAbort();
    }
  }

  async spawn({
    command,
    workingDirectory,
    env,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<SandboxProcess> {
    abortSignal?.throwIfAborted();

    const encoder = new TextEncoder();
    const output = createOutputStreams();
    const handle = await this.startCommand({
      command,
      workingDirectory,
      env,
      abortSignal,
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

    return {
      stdout: output.stdout,
      stderr: output.stderr,
      wait: () => finished,
      async kill(): Promise<void> {
        await handle.kill();
      },
    };
  }

  async readFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    return bytesToStream(bytes);
  }

  async readBinaryFile({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<Uint8Array | null> {
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
  }: {
    path: string;
    encoding?: string;
    startLine?: number;
    endLine?: number;
    abortSignal?: AbortSignal;
  }): Promise<string | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    const text = Buffer.from(bytes).toString(encoding as BufferEncoding);
    return extractLines({ text, startLine, endLine });
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: {
    path: string;
    content: ReadableStream<Uint8Array>;
    abortSignal?: AbortSignal;
  }): Promise<void> {
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
  }: {
    path: string;
    content: Uint8Array;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    abortSignal?.throwIfAborted();
    await this.sandbox.files.write(
      this.resolvePath(path),
      new Blob([content]),
      abortSignal ? { signal: abortSignal } : undefined,
    );
  }

  async writeTextFile({
    path,
    content,
    encoding = 'utf-8',
    abortSignal,
  }: {
    path: string;
    content: string;
    encoding?: string;
    abortSignal?: AbortSignal;
  }): Promise<void> {
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

  private resolvePath(path: string): string {
    return posix.resolve(this.workingDirectory, path);
  }

  /**
   * Starts a command without waiting for it. E2B runs the command through
   * `bash -l -c`. Its default 60 second command timeout is disabled so that
   * long installs and long-lived processes are not cut off.
   */
  private startCommand({
    command,
    workingDirectory = this.workingDirectory,
    env,
    abortSignal,
    onStdout,
    onStderr,
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  }): Promise<CommandHandle> {
    return this.sandbox.commands.run(command, {
      background: true,
      timeoutMs: 0,
      cwd: workingDirectory,
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
