import { type Sandbox as AISandbox } from 'ai';
import type { Sandbox as VercelSandboxSDK } from '@vercel/sandbox';

const rootDirectory = '/vercel/sandbox';

export class VercelSandbox implements AISandbox {
  constructor(
    public readonly sandbox: Awaited<
      ReturnType<typeof VercelSandboxSDK.create>
    >,
  ) {}

  async executeCommand({
    command,
    workingDirectory,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    abortSignal?: AbortSignal;
  }) {
    const sandboxCommand = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      cwd: workingDirectory ?? rootDirectory,
      detached: true,
    });

    const abortCommand = () => void sandboxCommand.kill('SIGTERM');
    if (abortSignal?.aborted) {
      abortCommand();
    } else {
      abortSignal?.addEventListener('abort', abortCommand, { once: true });
    }

    try {
      const result = await sandboxCommand.wait();

      return {
        exitCode: result.exitCode,
        stdout: await result.stdout(),
        stderr: await result.stderr(),
      };
    } finally {
      abortSignal?.removeEventListener('abort', abortCommand);
    }
  }

  async stop() {
    await this.sandbox.stop();
  }

  get description() {
    return `Vercel Sandbox ID: ${this.sandbox.sandboxId}\nRoot directory: ${rootDirectory}`;
  }
}
