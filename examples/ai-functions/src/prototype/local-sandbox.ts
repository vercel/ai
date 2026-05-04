import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { type Sandbox } from 'ai';

const execAsync = promisify(exec);

export class LocalSandbox implements Sandbox {
  /**
   * Root of the sandbox, used as the working directory by default.
   * This does not provide filesystem isolation; commands can escape it
   * with paths like `..`.
   */
  readonly rootDirectory: string;

  constructor({ rootDirectory }: { rootDirectory: string }) {
    this.rootDirectory = rootDirectory;
  }

  async executeCommand({ command }: { command: string }) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.rootDirectory,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        exitCode: 0,
        stdout: stdout || '',
        stderr: stderr || '',
      };
    } catch (error: any) {
      return {
        exitCode:
          error?.killed || error?.signal === 'SIGTERM' ? 1 : (error?.code ?? 1),
        stdout: error?.stdout ?? '',
        stderr: error?.stderr ?? String(error),
      };
    }
  }

  get description() {
    return `Root directory: ${this.rootDirectory}`;
  }
}
