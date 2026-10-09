import {
  InvalidArgumentError,
  tool,
  type Tool,
  type ToolExecuteFunction,
} from 'ai';
import { Bash } from 'just-bash';
import { posix } from 'node:path';
import { z } from 'zod/v4';

const workingDirectory = '/workspace';

type BashInput = { command: string };

type BashOutput = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const inputSchema = z.object({
  command: z.string().describe('The Bash command or script to execute.'),
});

function limitOutput(output: string, maxLength: number): string {
  if (output.length <= maxLength) {
    return output;
  }

  return `${output.slice(0, maxLength)}\n[Output truncated: ${output.length - maxLength} characters omitted.]`;
}

/**
 * Create a provider-independent bash tool backed by an in-memory just-bash
 * environment. Commands run in the application's Node.js process, not in a
 * host shell or a remote service.
 *
 * Files persist across calls to the returned tool. Each factory call creates
 * a separate filesystem. Shell variables and working directory changes do not
 * persist between commands.
 *
 * @param files - UTF-8 files to initialize, relative to `/workspace`.
 * @param maxOutputLength - Maximum characters retained from each output stream
 * before appending a truncation notice. Defaults to 30,000.
 */
export async function createBashTool({
  files = {},
  maxOutputLength = 30_000,
}: {
  files?: Record<string, string>;
  maxOutputLength?: number;
} = {}): Promise<{
  bash: Tool<BashInput, BashOutput, {}> & {
    execute: ToolExecuteFunction<BashInput, BashOutput, {}>;
  };
  sandbox: { readFile: (path: string) => Promise<string> };
}> {
  if (!Number.isSafeInteger(maxOutputLength) || maxOutputLength < 1) {
    throw new InvalidArgumentError({
      parameter: 'maxOutputLength',
      value: maxOutputLength,
      message: 'Must be a positive safe integer.',
    });
  }

  const initialFiles = Object.fromEntries(
    Object.entries(files).map(([path, content]) => {
      const resolvedPath = posix.resolve(workingDirectory, path);

      if (
        posix.isAbsolute(path) ||
        !resolvedPath.startsWith(`${workingDirectory}/`)
      ) {
        throw new InvalidArgumentError({
          parameter: 'files',
          value: path,
          message: 'File paths must be relative paths within /workspace.',
        });
      }

      return [resolvedPath, content];
    }),
  );

  const environment = new Bash({
    cwd: workingDirectory,
    files: initialFiles,
  });
  await environment.fs.mkdir(workingDirectory, { recursive: true });

  return {
    bash: tool<BashInput, BashOutput, {}>({
      description:
        'Run Bash commands over an in-memory filesystem. ' +
        'Every command starts in /workspace. Files persist between calls, but ' +
        'shell variables and directory changes do not. ' +
        'Use ls to discover files and commands such as cat, grep, sort, awk, ' +
        'and jq to inspect and transform them. Pipes and redirections are supported. ' +
        'Host files, network access, and arbitrary installed programs are unavailable. ' +
        'Returns stdout, stderr, and exitCode; long output is truncated.',
      inputSchema,
      execute: async ({ command }) => {
        const { stdout, stderr, exitCode } = await environment.exec(command, {
          cwd: workingDirectory,
        });

        return {
          stdout: limitOutput(stdout, maxOutputLength),
          stderr: limitOutput(stderr, maxOutputLength),
          exitCode,
        };
      },
    }),
    sandbox: {
      /** Read a generated UTF-8 file by its absolute in-memory path. */
      readFile: (path: string) => environment.fs.readFile(path),
    },
  };
}
