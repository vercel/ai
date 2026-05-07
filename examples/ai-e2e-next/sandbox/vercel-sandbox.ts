import { type Sandbox as AISandbox } from 'ai';
import type { Sandbox as VercelSandboxSDK } from '@vercel/sandbox';
import { text } from 'node:stream/consumers';

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
    return `Vercel Sandbox: ${this.sandbox.sandboxId}\nRoot directory: ${rootDirectory}`;
  }
}
