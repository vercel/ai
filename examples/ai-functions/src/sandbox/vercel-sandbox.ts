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
  }: {
    command: string;
    workingDirectory?: string;
  }) {
    const result = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', command],
      cwd: workingDirectory ?? rootDirectory,
    });

    return {
      exitCode: result.exitCode,
      stdout: await result.stdout(),
      stderr: await result.stderr(),
    };
  }

  async stop() {
    await this.sandbox.stop();
  }

  get description() {
    return `Vercel Sandbox ID: ${this.sandbox.sandboxId}\nRoot directory: ${rootDirectory}`;
  }
}
