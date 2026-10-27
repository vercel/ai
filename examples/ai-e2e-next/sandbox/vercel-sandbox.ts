import { isAbsolute, join } from 'node:path';
import { Readable } from 'node:stream';
import {
  extractLines,
  type Experimental_SandboxRunOptions as RunOptions,
  type Experimental_SandboxReadFileOptions as ReadFileOptions,
  type Experimental_SandboxReadBinaryFileOptions as ReadBinaryFileOptions,
  type Experimental_SandboxReadTextFileOptions as ReadTextFileOptions,
  type Experimental_SandboxWriteFileOptions as WriteFileOptions,
  type Experimental_SandboxWriteBinaryFileOptions as WriteBinaryFileOptions,
  type Experimental_SandboxWriteTextFileOptions as WriteTextFileOptions,
  type Experimental_SandboxProcess,
  type Experimental_SandboxSpawnOptions as SpawnOptions,
  type Experimental_SandboxSpawnOptionsWithStdin as SpawnOptionsWithStdin,
  type Experimental_SandboxSpawnOptionsWithoutStdin as SpawnOptionsWithoutStdin,
} from '@ai-sdk/provider-utils';
import { type Experimental_SandboxSession as SandboxSession } from 'ai';
import type { Command, Sandbox as VercelSandboxSDK } from '@vercel/sandbox';
import {
  bytesToStream,
  collectStream,
  collectStreamToString,
} from './stream-utils';

const rootDirectory = '/vercel/sandbox';

// Vercel Sandbox authenticates with a Vercel OIDC token.
//
// Deployed on Vercel:
// 1. Open the project in the Vercel dashboard.
// 2. Go to Settings > Security.
// 3. Enable "Secure backend access with OIDC federation" and save.
//
// Local development:
// 1. Run `vercel link`.
// 2. Run `vercel env pull` to write VERCEL_OIDC_TOKEN to .env.local.
//
// Without OIDC, @vercel/sandbox reports a missing `x-vercel-oidc-token`
// header when creating or retrieving sandboxes.
export class VercelSandboxSession implements SandboxSession {
  constructor(public readonly sandbox: VercelSandboxSDK) {}

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : join(rootDirectory, path);
  }

  async run({ command, workingDirectory, env, abortSignal }: RunOptions) {
    const proc = await this.spawn({
      command,
      workingDirectory,
      env,
      abortSignal,
    });

    const [stdout, stderr, { exitCode }] = await Promise.all([
      collectStreamToString(proc.stdout),
      collectStreamToString(proc.stderr),
      proc.wait(),
    ]);

    return { exitCode, stdout, stderr };
  }

  spawn(options: SpawnOptionsWithStdin): Promise<never>;
  spawn(
    options: SpawnOptionsWithoutStdin,
  ): Promise<Experimental_SandboxProcess>;
  spawn(options: SpawnOptions): Promise<Experimental_SandboxProcess>;
  async spawn({
    command,
    workingDirectory,
    env,
    abortSignal,
    stdin,
  }: SpawnOptions): Promise<Experimental_SandboxProcess> {
    abortSignal?.throwIfAborted();
    if (stdin === true) {
      throw new Error('Vercel Sandbox does not support writable stdin.');
    }

    const live = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      cwd: workingDirectory ?? rootDirectory,
      env,
      detached: true,
    });

    return createSandboxProcess(live, abortSignal);
  }

  async readFile({
    path,
    abortSignal,
  }: ReadFileOptions): Promise<ReadableStream<Uint8Array> | null> {
    abortSignal?.throwIfAborted();
    const result = await this.sandbox.readFile({
      path: this.resolvePath(path),
    });
    if (result == null) return null;
    return Readable.toWeb(
      Readable.from(result as NodeJS.ReadableStream),
    ) as ReadableStream<Uint8Array>;
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: WriteFileOptions): Promise<void> {
    abortSignal?.throwIfAborted();
    const bytes = await collectStream(content);
    abortSignal?.throwIfAborted();
    await this.sandbox.writeFiles([
      { path: this.resolvePath(path), content: Buffer.from(bytes) },
    ]);
  }

  async readBinaryFile({
    path,
    abortSignal,
  }: ReadBinaryFileOptions): Promise<Uint8Array | null> {
    const stream = await this.readFile({ path, abortSignal });
    if (stream == null) return null;
    return collectStream(stream);
  }

  async writeBinaryFile({
    path,
    content,
    abortSignal,
  }: WriteBinaryFileOptions): Promise<void> {
    await this.writeFile({
      path,
      content: bytesToStream(content),
      abortSignal,
    });
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

  async writeTextFile({
    path,
    content,
    encoding = 'utf-8',
    abortSignal,
  }: WriteTextFileOptions): Promise<void> {
    const bytes = Buffer.from(content, encoding as BufferEncoding);
    await this.writeBinaryFile({
      path,
      content: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      abortSignal,
    });
  }

  async stop() {
    await this.sandbox.stop();
  }

  get description() {
    return `Vercel Sandbox: ${this.sandbox.name}\nRoot directory: ${rootDirectory}`;
  }
}

function createSandboxProcess(
  command: Command,
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

  const abortCommand = () => void command.kill('SIGTERM');
  if (abortSignal?.aborted) {
    abortCommand();
  } else {
    abortSignal?.addEventListener('abort', abortCommand, { once: true });
  }

  return {
    stdout,
    stderr,
    async wait(): Promise<{ exitCode: number }> {
      try {
        const finished = await command.wait();
        await drained;
        if (abortSignal?.aborted) {
          throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        return { exitCode: finished.exitCode };
      } finally {
        abortSignal?.removeEventListener('abort', abortCommand);
      }
    },
    async kill(): Promise<void> {
      await command.kill('SIGTERM');
    },
  };
}
