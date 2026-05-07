import { type Sandbox } from 'ai';
import { type Bash } from 'just-bash';

export class JustBashSandbox implements Sandbox {
  constructor(private readonly bash: Bash) {}

  async executeCommand({ command }: { command: string }) {
    const result = await this.bash.exec(command);

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
