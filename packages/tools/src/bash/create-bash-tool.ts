import {
  InvalidArgumentError,
  tool,
  type Tool,
  type ToolExecuteFunction,
  type Experimental_SandboxSession as SandboxSession,
} from 'ai';
import { posix } from 'node:path';
import { z } from 'zod/v4';

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
 * Create a provider-independent bash tool backed by a supplied sandbox session.
 *
 * The caller owns the sandbox's lifecycle. Tools using the same session share
 * its files. Available commands and persistence depend on the sandbox.
 * Returns the tool; use the supplied sandbox for file access.
 *
 * @param sandbox - Sandbox session used for commands and file operations.
 * @param files - UTF-8 files to initialize, relative to `workingDirectory`.
 * @param workingDirectory - Absolute starting directory for every command.
 * Defaults to `/workspace` and is created if needed.
 * @param maxOutputLength - Maximum characters retained from each output stream
 * before appending a truncation notice. Defaults to 30,000.
 */
export async function createBashTool({
  sandbox,
  files = {},
  workingDirectory = '/workspace',
  maxOutputLength = 30_000,
}: {
  sandbox: SandboxSession;
  files?: Record<string, string>;
  workingDirectory?: string;
  maxOutputLength?: number;
}): Promise<
  Tool<BashInput, BashOutput, {}> & {
    execute: ToolExecuteFunction<BashInput, BashOutput, {}>;
  }
> {
  if (!Number.isSafeInteger(maxOutputLength) || maxOutputLength < 1) {
    throw new InvalidArgumentError({
      parameter: 'maxOutputLength',
      value: maxOutputLength,
      message: 'Must be a positive safe integer.',
    });
  }

  if (!posix.isAbsolute(workingDirectory)) {
    throw new InvalidArgumentError({
      parameter: 'workingDirectory',
      value: workingDirectory,
      message: 'Must be an absolute path in the sandbox.',
    });
  }

  workingDirectory = posix.normalize(workingDirectory);

  const initialFiles = Object.entries(files).map(([path, content]) => {
    const resolvedPath = posix.resolve(workingDirectory, path);
    const relativePath = posix.relative(workingDirectory, resolvedPath);

    if (
      posix.isAbsolute(path) ||
      relativePath === '' ||
      relativePath === '..' ||
      relativePath.startsWith('../')
    ) {
      throw new InvalidArgumentError({
        parameter: 'files',
        value: path,
        message: 'File paths must be relative paths within workingDirectory.',
      });
    }

    return { path: resolvedPath, content };
  });

  const directoryResult = await sandbox.run({
    command: `mkdir -p -- '${workingDirectory.replace(/'/g, "'\\''")}'`,
  });
  if (directoryResult.exitCode !== 0) {
    throw new Error(
      `Failed to create working directory: ${directoryResult.stderr}`,
    );
  }

  for (const file of initialFiles) {
    await sandbox.writeTextFile(file);
  }

  return tool<BashInput, BashOutput, {}>({
    description:
      'Run Bash commands in the sandbox. ' +
      `Every command starts in ${workingDirectory}. ` +
      'Use ls to discover files and commands such as cat, grep, sort, awk, ' +
      'and jq to inspect and transform them. Pipes and redirections are supported. ' +
      'Returns stdout, stderr, and exitCode; long output is truncated.\n' +
      sandbox.description,
    inputSchema,
    execute: async ({ command }, { abortSignal }) => {
      const { stdout, stderr, exitCode } = await sandbox.run({
        command,
        workingDirectory,
        abortSignal,
      });

      return {
        stdout: limitOutput(stdout, maxOutputLength),
        stderr: limitOutput(stderr, maxOutputLength),
        exitCode,
      };
    },
  });
}
