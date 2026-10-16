import {
  InvalidArgumentError,
  tool,
  type Tool,
  type ToolExecuteFunction,
  type Experimental_SandboxSession as SandboxSession,
} from 'ai';
import { posix } from 'node:path';
import { z } from 'zod/v4';

type BashInput = z.infer<typeof inputSchema>;

type BashOutput = z.infer<typeof outputSchema>;

const inputSchema = z.object({
  command: z.string().describe('The Bash command or script to execute.'),
});

const outputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
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
 * @param workingDirectory - Optional absolute starting directory for every
 * command, created if needed. When omitted, uses the sandbox's default directory.
 * @param maxOutputLength - Maximum characters retained from each output stream
 * before appending a truncation notice. Defaults to 30,000.
 */
export async function bashTool({
  sandbox,
  workingDirectory,
  maxOutputLength = 30_000,
}: {
  sandbox: SandboxSession;
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

  if (workingDirectory !== undefined && !posix.isAbsolute(workingDirectory)) {
    throw new InvalidArgumentError({
      parameter: 'workingDirectory',
      value: workingDirectory,
      message: 'Must be an absolute path in the sandbox.',
    });
  }

  if (workingDirectory !== undefined) {
    workingDirectory = posix.normalize(workingDirectory);
  }

  if (workingDirectory !== undefined) {
    const directoryResult = await sandbox.run({
      command: `mkdir -p -- '${workingDirectory.replace(/'/g, "'\\''")}'`,
    });
    if (directoryResult.exitCode !== 0) {
      throw new Error(
        `Failed to create working directory: ${directoryResult.stderr}`,
      );
    }
  }

  return tool<BashInput, BashOutput, {}>({
    description:
      'Run Bash commands in the sandbox. ' +
      (workingDirectory !== undefined
        ? `Every command starts in ${workingDirectory}. `
        : "Commands run in the sandbox's default working directory. ") +
      'Use ls to discover files and commands such as cat, grep, sort, awk, ' +
      'and jq to inspect and transform them. Pipes and redirections are supported. ' +
      'Returns stdout, stderr, and exitCode; long output is truncated.\n' +
      sandbox.description,
    inputSchema,
    outputSchema,
    execute: async ({ command }, { abortSignal }) => {
      const { stdout, stderr, exitCode } = await sandbox.run({
        command,
        ...(workingDirectory !== undefined ? { workingDirectory } : {}),
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
