import { type Experimental_Sandbox as Sandbox } from 'ai';
import { type Bash } from 'just-bash';

export class JustBashSandbox implements Sandbox {
  constructor(private readonly bash: Bash) {}

  async runCommand({
    command,
    workingDirectory,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    abortSignal?: AbortSignal;
  }) {
    abortSignal?.throwIfAborted();

    const result = await this.bash.exec(command, { cwd: workingDirectory });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  get description() {
    return [
      'just-bash JavaScript bash environment with a virtual filesystem.',
      'Shell state resets between commands, while filesystem changes are shared.',
      `Current working directory: ${this.bash.getCwd()}`,
    ].join('\n');
  }
}
