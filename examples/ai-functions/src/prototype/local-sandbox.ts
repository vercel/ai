import { spawn } from 'node:child_process';
import type { Sandbox } from './sandbox';

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

  executeCommand({ command }: { command: string }) {
    return new Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>(resolve => {
      const childProcess = spawn(command, {
        cwd: this.rootDirectory,
        shell: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      childProcess.stdout.on('data', data => {
        stdout.push(Buffer.from(data));
      });

      childProcess.stderr.on('data', data => {
        stderr.push(Buffer.from(data));
      });

      childProcess.on('error', error => {
        stderr.push(Buffer.from(error.message));
      });

      childProcess.on('close', exitCode => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        });
      });
    });
  }

  get description() {
    return `Root directory: ${this.rootDirectory}`;
  }
}
