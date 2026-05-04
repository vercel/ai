import { openai } from '@ai-sdk/openai';
import { spawn } from 'node:child_process';
import { tool, ToolLoopAgent } from 'ai';
import { run } from '../lib/run';
import { z } from 'zod';

type Sandbox = {
  /**
   * Description of the sandbox environment that can be added to the agent's instructions
   * so that the agent knows about relevant details such as the root directory, exposed
   * ports, the public hostname, etc.
   */
  readonly description: string;

  /**
   * Execute a command in the sandbox.
   */
  executeCommand: (options: { command: string }) => PromiseLike<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

class LocalSandbox implements Sandbox {
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

function sandboxShellTool() {
  return tool({
    description: 'Run a shell command',
    inputSchema: z.object({
      command: z.string(),
    }),
    contextSchema: z.object({
      sandbox: z.custom<Sandbox>(),
    }),
    execute: async ({ command }, { context: { sandbox } }) => {
      return sandbox.executeCommand({ command });
    },
  });
}

const sandbox = new LocalSandbox({
  rootDirectory: `${process.env.HOME}/Downloads`,
});

const agent = new ToolLoopAgent({
  model: openai('gpt-5.5'),

  instructions:
    `You are a helpful assistant that can run shell commands.` +
    `You are operating in the following sandbox:` +
    sandbox.description,

  tools: {
    shell: sandboxShellTool(),
  },

  toolsContext: {
    shell: {
      sandbox,
    },
  },
});

run(async () => {
  const result = await agent.stream({
    prompt: 'List the files in the directory',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
