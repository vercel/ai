import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { type Sandbox } from 'ai';

const execAsync = promisify(exec);

/**
 * WARNING: This is not a security sandbox.
 *
 * LocalSandbox only sets the working directory for shell commands. Commands can
 * still read or edit files outside `rootDirectory` through absolute paths,
 * parent-directory paths, symlinks, subprocesses, and shell features. Only use
 * this with trusted commands.
 */
export class LocalSandbox implements Sandbox {
  /**
   * Root directory used as the default working directory.
   *
   * WARNING: This does not provide filesystem isolation.
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
    return [
      'WARNING: LocalSandbox is not a true sandbox.',
      'Commands can access files outside the root directory.',
      `Root directory: ${this.rootDirectory}`,
    ].join('\n');
  }
}
