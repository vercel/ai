import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import {
  extractLines,
  type Experimental_SandboxSession as SandboxSession,
  type Experimental_SandboxProcess as SandboxProcess,
} from '@ai-sdk/provider-utils';
import type { ContainerProcess, Sandbox } from 'modal';
import { isModalError } from './utils';

/**
 * Runs the command as a background job in its own process group and records
 * the job's process ID, because Modal cannot signal a process it started.
 * Job control is only needed to start the job; leaving it on would print job
 * status lines to stderr. `$1` is the process ID file and `$2` is the command.
 */
const SPAWN_SCRIPT = [
  'set -m',
  'bash -c "$2" < /dev/null &',
  'child=$!',
  'set +m',
  'echo "$child" > "$1"',
  'wait "$child"',
  'code=$?',
  'rm -f "$1"',
  'exit "$code"',
].join('\n');

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
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const process = await this.spawn({
      command,
      workingDirectory,
      env,
      abortSignal,
    });

    const [stdout, stderr, { exitCode }] = await Promise.all([
      collectText(process.stdout),
      collectText(process.stderr),
      process.wait(),
    ]);

    return { exitCode, stdout, stderr };
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

    const processIdFile = `/tmp/.ai-sdk-sandbox-${randomUUID()}.pid`;
    const process = await this.sandbox.exec(
      ['bash', '-c', SPAWN_SCRIPT, 'bash', processIdFile, command],
      {
        mode: 'binary',
        workdir: this.resolvePath(workingDirectory ?? '.'),
        ...(env !== undefined ? { env } : {}),
      },
    );

    return createSandboxProcess({
      sandbox: this.sandbox,
      process,
      processIdFile,
      abortSignal,
    });
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
    // Modal creates missing parent directories and overwrites existing files.
    await this.sandbox.filesystem.writeBytes(content, this.resolvePath(path));
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

  /**
   * Modal only accepts absolute paths, so relative paths resolve against the
   * sandbox working directory.
   */
  private resolvePath(path: string): string {
    return posix.resolve(this.workingDirectory, path);
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
