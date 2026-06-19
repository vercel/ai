import { posix } from 'node:path';
import {
  extractLines,
  type Experimental_SandboxSession,
  type Experimental_SandboxProcess,
} from '@ai-sdk/provider-utils';
import {
  OutputMode,
  ProcessStatus,
  type ProcessInfo,
  type Sandbox,
} from 'tensorlake';

/**
 * Default working directory for Tensorlake sandboxes. The default sandbox image
 * runs as the non-root user `tl-user`, whose home (`/home/tl-user`) is the only
 * location writable without elevated permissions — `/root` and a freshly
 * created `/workspace` are not (the user cannot write to `/`). The harness
 * composes each session's working directory underneath this path, so it must be
 * owned by the executing user. Override via the provider's `workingDirectory`
 * setting when using a custom image whose user/home differ.
 */
export const TENSORLAKE_DEFAULT_WORKING_DIRECTORY = '/home/tl-user';

/** Interval between process-status polls while awaiting a spawned process. */
const PROCESS_POLL_INTERVAL_MS = 250;

/**
 * `Experimental_SandboxSession` implementation backed by a `tensorlake`
 * `Sandbox` instance. This is the tool-safe surface (file I/O, exec, spawn);
 * it is what `TensorlakeNetworkSandboxSession.restricted()` returns and is not
 * constructed directly by consumers. The network sandbox session owns the
 * lifetime of the underlying sandbox.
 */
export class TensorlakeSandboxSession implements Experimental_SandboxSession {
  constructor(protected readonly sandbox: Sandbox) {}

  get description(): string {
    return [
      `Tensorlake Sandbox (id: ${this.sandbox.sandboxId}).`,
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

    const result = await this.sandbox.run('bash', {
      args: ['-c', command],
      ...(workingDirectory !== undefined
        ? { workingDir: workingDirectory }
        : {}),
      ...(env !== undefined ? { env } : {}),
    });

    abortSignal?.throwIfAborted();

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
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
  }): Promise<Experimental_SandboxProcess> {
    abortSignal?.throwIfAborted();

    const process = await this.sandbox.startProcess('bash', {
      args: ['-c', command],
      stdoutMode: OutputMode.CAPTURE,
      stderrMode: OutputMode.CAPTURE,
      ...(workingDirectory !== undefined
        ? { workingDir: workingDirectory }
        : {}),
      ...(env !== undefined ? { env } : {}),
    });

    return createSandboxProcess(this.sandbox, process.pid, abortSignal);
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
      // `readFile` returns a `Traced<Uint8Array>` (the array with an extra
      // `traceId` property). Copy into a clean `Uint8Array` to drop it.
      const bytes = await this.sandbox.readFile(path);
      return new Uint8Array(bytes);
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
    const bytes = await collectStream(content);
    await this.writeBinaryFile({ path, content: bytes, abortSignal });
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
    const parent = posix.dirname(path);
    if (parent && parent !== '.' && parent !== '/') {
      // Tensorlake's `writeFile` does not create parent directories; do it
      // explicitly so writes to nested paths succeed.
      await this.sandbox.run('mkdir', { args: ['-p', parent] });
    }
    await this.sandbox.writeFile(path, content);
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
}

/**
 * Adapt a Tensorlake background process (identified by `pid`) to the
 * `Experimental_SandboxProcess` interface. Tensorlake has no native
 * "wait for exit" call, so `wait()` polls `getProcess(pid)` until the process
 * reaches a terminal status; stdout/stderr are streamed via `followStdout`
 * and `followStderr`.
 */
function createSandboxProcess(
  sandbox: Sandbox,
  pid: number,
  abortSignal: AbortSignal | undefined,
): Experimental_SandboxProcess {
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

  const followInto = async (
    iterable: AsyncIterable<{ line: string }>,
    controller: ReadableStreamDefaultController<Uint8Array> | undefined,
  ): Promise<void> => {
    for await (const event of iterable) {
      // `OutputEvent.line` carries a single line without its trailing newline;
      // re-add it to preserve line-oriented output.
      controller?.enqueue(encoder.encode(`${event.line}\n`));
    }
  };

  const drained = (async () => {
    try {
      const opts = abortSignal ? { signal: abortSignal } : undefined;
      await Promise.all([
        followInto(sandbox.followStdout(pid, opts), controllers.stdout),
        followInto(sandbox.followStderr(pid, opts), controllers.stderr),
      ]);
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
        let exitCode = 0;
        while (true) {
          abortSignal?.throwIfAborted();
          const info = await sandbox.getProcess(pid);
          if (info.status !== ProcessStatus.RUNNING) {
            exitCode = exitCodeFromProcessInfo(info);
            break;
          }
          await new Promise<void>(resolve =>
            setTimeout(resolve, PROCESS_POLL_INTERVAL_MS),
          );
        }
        await drained.catch(() => {});
        if (abortSignal?.aborted) {
          throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        return { exitCode };
      } catch (error) {
        // Honor the abort contract: a cancelled `wait()` must not leave the
        // process running in the sandbox. Tensorlake's `run`/`startProcess`
        // have no native cancellation, so the spawned process is killed here.
        if (abortSignal?.aborted) {
          await sandbox.killProcess(pid).catch(() => {});
        }
        throw error;
      }
    },
    async kill(): Promise<void> {
      await sandbox.killProcess(pid);
    },
  };
}

/**
 * Derive a process exit code from a terminal {@link ProcessInfo}. Tensorlake
 * reports an explicit `exitCode` for normally-exited processes and a `signal`
 * for signalled ones, but for some terminal statuses — notably
 * `OOM_KILLED` — both can be absent. Falling back to `0` there would report a
 * killed command as successful, so any terminal status without an explicit
 * exit code maps to a non-zero failure.
 */
function exitCodeFromProcessInfo(info: ProcessInfo): number {
  if (info.exitCode != null) return info.exitCode;
  if (info.signal != null) return 128 + info.signal;
  // OOM kills are delivered as SIGKILL (9) on Linux but may arrive without an
  // explicit signal; represent them with the conventional 128 + 9 = 137.
  if (info.status === ProcessStatus.OOM_KILLED) return 128 + 9;
  // Any other non-running status lacking exit info (e.g. SIGNALED without a
  // signal number) is an abnormal termination: fail rather than report success.
  return 1;
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
  const status = (error as { status?: unknown; statusCode?: unknown }).status;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (status === 404 || statusCode === 404) return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    /no such file|not found|does not exist|ENOENT|404/i.test(message)
  );
}
