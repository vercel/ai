import { posix } from 'node:path';
import {
  extractLines,
  type Experimental_SandboxProcess,
  type Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';
import type { SpritesApiClient } from './sprites-api-client';

/**
 * `Experimental_SandboxSession` implementation backed by a Sprite. This is the
 * tool-safe surface (file I/O, exec, spawn); it is what
 * {@link SpritesNetworkSandboxSession.restricted} returns and is not
 * constructed directly by consumers. The network sandbox session owns the
 * lifetime of the underlying Sprite.
 */
export class SpritesSandboxSession implements Experimental_SandboxSession {
  constructor(
    protected readonly client: SpritesApiClient,
    protected readonly spriteName: string,
    protected readonly spritePublicUrl: string,
    protected readonly workingDirectory: string,
  ) {}

  get description(): string {
    return [
      `Sprite sandbox (name: ${this.spriteName}, url: ${this.spritePublicUrl}).`,
      `Default working directory: ${this.workingDirectory}.`,
      'Filesystem changes persist for the lifetime of the sprite.',
    ].join('\n');
  }

  /** Resolve relative paths against the session working directory. */
  protected resolvePath(path: string): string {
    return path.startsWith('/')
      ? path
      : posix.join(this.workingDirectory, path);
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

    const proc = await this.client.exec(this.spriteName, {
      argv: ['bash', '-c', command],
      cwd: workingDirectory ?? this.workingDirectory,
      ...(env !== undefined ? { env } : {}),
      ...(abortSignal !== undefined ? { abortSignal } : {}),
    });

    const stdoutPromise = collectText(proc.stdout);
    const stderrPromise = collectText(proc.stderr);
    const { exitCode } = await proc.wait();
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

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
  }): Promise<Experimental_SandboxProcess> {
    abortSignal?.throwIfAborted();

    return await this.client.exec(this.spriteName, {
      argv: ['bash', '-c', command],
      cwd: workingDirectory ?? this.workingDirectory,
      ...(env !== undefined ? { env } : {}),
      ...(abortSignal !== undefined ? { abortSignal } : {}),
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
    return this.client.readFile(
      this.spriteName,
      this.resolvePath(path),
      abortSignal,
    );
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
    const bytes = await collectBytes(content, abortSignal);
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
    // The filesystem write endpoint creates missing parent directories
    // recursively, satisfying the SandboxSession contract without an extra
    // round-trip.
    await this.client.writeFile(
      this.spriteName,
      this.resolvePath(path),
      content,
      abortSignal,
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
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function collectBytes(
  stream: ReadableStream<Uint8Array>,
  abortSignal?: AbortSignal,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // A slow/never-ending source stream must not keep writeFile hung past an
  // abort: race each read against the signal, matching the abort error shape
  // `exec`'s `wait()` throws (see sprites-api-client.ts).
  let onAbort: (() => void) | undefined;
  const aborted =
    abortSignal != null
      ? new Promise<never>((_, reject) => {
          onAbort = () => {
            reject(
              abortSignal.reason ?? new DOMException('Aborted', 'AbortError'),
            );
          };
          abortSignal.addEventListener('abort', onAbort);
        })
      : undefined;
  try {
    abortSignal?.throwIfAborted();
    while (true) {
      const { value, done } = await (aborted
        ? Promise.race([reader.read(), aborted])
        : reader.read());
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } catch (error) {
    await reader.cancel(abortSignal?.reason).catch(() => {});
    reader.releaseLock();
    throw error;
  } finally {
    if (abortSignal != null && onAbort != null) {
      abortSignal.removeEventListener('abort', onAbort);
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
  const decoder = new TextDecoder();
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
