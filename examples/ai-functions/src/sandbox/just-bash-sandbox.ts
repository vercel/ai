import { isAbsolute, join } from 'node:path';
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
import {
  type SandboxCommand,
  type Sandbox as JustBashSandboxSDK,
} from 'just-bash';
import {
  bytesToStream,
  collectStream,
  collectStreamToString,
} from './lib/stream-utils';

export class JustBashSandboxSession implements SandboxSession {
  constructor(private readonly sandbox: JustBashSandboxSDK) {}

  private resolvePath(path: string): string {
    return isAbsolute(path)
      ? path
      : join(this.sandbox.bashEnvInstance.getCwd(), path);
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
      throw new Error('just-bash does not support writable stdin.');
    }

    const live = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      detached: true,
      ...(workingDirectory !== undefined ? { cwd: workingDirectory } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(abortSignal !== undefined ? { signal: abortSignal } : {}),
    });

    return createSandboxProcess(live, abortSignal);
  }

  async readFile({
    path,
    abortSignal,
  }: ReadFileOptions): Promise<ReadableStream<Uint8Array> | null> {
    abortSignal?.throwIfAborted();
    const resolved = this.resolvePath(path);
    try {
      const bytes =
        await this.sandbox.bashEnvInstance.fs.readFileBuffer(resolved);
      return bytesToStream(bytes);
    } catch (error: any) {
      if (
        error?.code === 'ENOENT' ||
        /no such file|ENOENT/i.test(String(error?.message))
      ) {
        return null;
      }
      throw error;
    }
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: WriteFileOptions): Promise<void> {
    abortSignal?.throwIfAborted();
    const bytes = await collectStream(content);
    abortSignal?.throwIfAborted();
    await this.sandbox.bashEnvInstance.fs.writeFile(
      this.resolvePath(path),
      bytes,
    );
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

  get description() {
    return [
      'just-bash JavaScript bash environment with a virtual filesystem.',
      'Shell state resets between commands, while filesystem changes are shared.',
      `Current working directory: ${this.sandbox.bashEnvInstance.getCwd()}`,
    ].join('\n');
  }
}

function createSandboxProcess(
  command: SandboxCommand,
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
      for await (const message of command.logs()) {
        const target =
          message.type === 'stdout' ? controllers.stdout : controllers.stderr;
        target?.enqueue(encoder.encode(message.data));
      }
      controllers.stdout?.close();
      controllers.stderr?.close();
    } catch (error) {
      controllers.stdout?.error(error);
      controllers.stderr?.error(error);
    }
  })();

  const abortHandler = () => void command.kill();
  if (abortSignal?.aborted) {
    abortHandler();
  } else {
    abortSignal?.addEventListener('abort', abortHandler, { once: true });
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
        abortSignal?.removeEventListener('abort', abortHandler);
      }
    },
    async kill(): Promise<void> {
      await command.kill();
    },
  };
}
