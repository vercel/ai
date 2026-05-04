import { type Sandbox as AISandbox } from 'ai';
import { Sandbox as VercelSandboxSDK } from '@vercel/sandbox';

const rootDirectory = '/vercel/sandbox';

export class VercelSandbox implements AISandbox {
  private constructor(
    private readonly sandbox: Awaited<
      ReturnType<typeof VercelSandboxSDK.create>
    >,
  ) {}

  static async create() {
    const sandbox = await VercelSandboxSDK.create({
      timeout: 5 * 60 * 1000,
      runtime: 'node22',
    });

    return new VercelSandbox(sandbox);
  }

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

  async stop() {
    await this.sandbox.stop();
  }

  get description() {
    return `Vercel Sandbox ID: ${this.sandbox.sandboxId}\nRoot directory: ${rootDirectory}`;
  }
}
