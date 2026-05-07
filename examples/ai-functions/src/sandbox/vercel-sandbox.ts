import { type Sandbox as AISandbox } from 'ai';
import type { Sandbox as VercelSandboxSDK } from '@vercel/sandbox';
import { text } from 'node:stream/consumers';

const rootDirectory = '/vercel/sandbox';

export class VercelSandbox implements AISandbox {
  constructor(
    public readonly sandbox: Awaited<
      ReturnType<typeof VercelSandboxSDK.create>
    >,
  ) {}

  async executeCommand({ command }: { command: string }) {
    const result = await this.sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', `cd "${rootDirectory}" && ${command}`],
    });

    return {
      exitCode: result.exitCode,
      stdout: await result.stdout(),
      stderr: await result.stderr(),
    };
  }

  async readFile({ path }: { path: string }) {
    const stream = await this.sandbox.readFile({
      path,
      cwd: rootDirectory,
    });

    if (stream == null) {
      throw new Error(`File not found: ${path}`);
    }

    return {
      content: await text(stream),
    };
  }

  async stop() {
    await this.sandbox.stop();
  }

  get description() {
    return `Vercel Sandbox ID: ${this.sandbox.sandboxId}\nRoot directory: ${rootDirectory}`;
  }
}
