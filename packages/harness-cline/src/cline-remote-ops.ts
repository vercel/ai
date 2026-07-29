import path from 'node:path';
import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

/**
 * Sandbox-backed implementations of the Cline harness's built-in tools.
 *
 * The Cline runtime executes on the host, but the workspace the model reasons
 * about lives in the sandbox — every file/shell operation goes through the
 * restricted `SandboxSession` surface. Relative paths resolve against the
 * per-session working directory the framework created.
 */
export interface ClineRemoteOpsOptions {
  readonly sandbox: Experimental_SandboxSession;
  /** Absolute sandbox path of the session's working directory. */
  readonly workDir: string;
}

export interface ClineRemoteOps {
  resolvePath(inputPath: string): string;
  readFile(inputPath: string): Promise<string>;
  writeFile(inputPath: string, content: string): Promise<void>;
  editFile(inputPath: string, oldText: string, newText: string): Promise<void>;
  bash(
    command: string,
    input?: {
      /** Timeout in seconds (the `bash` tool contract). */
      timeout?: number;
      signal?: AbortSignal;
    },
  ): Promise<{ output: string; exitCode: number }>;
  grep(
    pattern: string,
    input?: {
      path?: string;
      glob?: string;
      ignoreCase?: boolean;
      literal?: boolean;
      context?: number;
      limit?: number;
    },
  ): Promise<string>;
  glob(pattern: string, inputPath?: string, limit?: number): Promise<string[]>;
  ls(inputPath?: string, limit?: number): Promise<string[]>;
}

export function createClineRemoteOps(
  options: ClineRemoteOpsOptions,
): ClineRemoteOps {
  const { sandbox, workDir } = options;

  const resolvePath = (inputPath: string): string => {
    const normalized = path.posix.isAbsolute(inputPath)
      ? path.posix.normalize(inputPath)
      : path.posix.normalize(path.posix.join(workDir, inputPath));
    return normalized;
  };

  const runShell = async (
    command: string,
    input?: { signal?: AbortSignal },
  ): Promise<{ exitCode: number; output: string }> => {
    // `sandbox.run({ command })` already wraps in a shell; interpolated
    // paths/values inside `command` are quoted with `shellQuote` by callers.
    const result = await sandbox.run({
      command,
      workingDirectory: workDir,
      ...(input?.signal ? { abortSignal: input.signal } : {}),
    });
    return {
      exitCode: result.exitCode,
      output: `${result.stdout}${result.stderr}`,
    };
  };

  const readFile = async (inputPath: string): Promise<string> => {
    const resolved = resolvePath(inputPath);
    const content = await sandbox.readTextFile({ path: resolved });
    if (content == null) {
      throw new Error(`File not found: ${inputPath}`);
    }
    return content;
  };

  const writeFile = async (
    inputPath: string,
    content: string,
  ): Promise<void> => {
    const resolved = resolvePath(inputPath);
    // `writeTextFile` creates parent directories recursively per the
    // SandboxSession contract, so no explicit mkdir is needed.
    await sandbox.writeTextFile({ path: resolved, content });
  };

  const editFile = async (
    inputPath: string,
    oldText: string,
    newText: string,
  ): Promise<void> => {
    const current = await readFile(inputPath);
    const index = current.indexOf(oldText);
    if (index === -1) {
      throw new Error(`Text to replace was not found in ${inputPath}`);
    }
    const updated = `${current.slice(0, index)}${newText}${current.slice(
      index + oldText.length,
    )}`;
    await writeFile(inputPath, updated);
  };

  return {
    resolvePath,
    readFile,
    writeFile,
    editFile,

    async bash(command, input) {
      const controller = new AbortController();
      // `input.timeout` is expressed in seconds (the `bash` tool contract),
      // so convert to milliseconds for `setTimeout`.
      const timeoutId =
        typeof input?.timeout === 'number' && input.timeout > 0
          ? setTimeout(() => controller.abort(), input.timeout * 1000)
          : undefined;

      const forwardedSignal = input?.signal;
      const onAbort = () => controller.abort();
      forwardedSignal?.addEventListener('abort', onAbort, { once: true });

      try {
        const result = await runShell(command, { signal: controller.signal });
        return { output: result.output, exitCode: result.exitCode };
      } finally {
        forwardedSignal?.removeEventListener('abort', onAbort);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    },

    async grep(pattern, input = {}) {
      const target = resolvePath(input.path ?? '.');
      const flags = [
        '-R',
        '-n',
        '--binary-files=without-match',
        ...(input.ignoreCase ? ['-i'] : []),
        ...(input.literal ? ['-F'] : []),
        ...(typeof input.context === 'number' && input.context > 0
          ? ['-C', String(input.context)]
          : []),
        ...(input.glob ? ['--include', input.glob] : []),
      ];
      const limit = Math.max(1, input.limit ?? 100);
      const result = await runShell(
        [
          `if [ ! -e ${shellQuote(
            target,
          )} ]; then echo "__CLINE_GREP_NOT_FOUND__"; exit 2; fi`,
          `grep ${flags.map(shellQuote).join(' ')} -- ${shellQuote(
            pattern,
          )} ${shellQuote(target)} 2>/dev/null | head -n ${limit}`,
        ].join('; '),
      );

      const output = result.output.trim();
      if (output.includes('__CLINE_GREP_NOT_FOUND__')) {
        throw new Error(`Path not found: ${input.path ?? '.'}`);
      }
      return output || 'No matches found';
    },

    async glob(pattern, inputPath = '.', limit = 1_000) {
      const target = resolvePath(inputPath);
      const result = await runShell(
        [
          `if [ ! -e ${shellQuote(
            target,
          )} ]; then echo "__CLINE_FIND_NOT_FOUND__"; exit 2; fi`,
          `if [ -d ${shellQuote(target)} ]; then find ${shellQuote(
            target,
          )} -type f -print; else printf '%s\\n' ${shellQuote(target)}; fi`,
        ].join('; '),
      );

      const output = result.output.trim();
      if (output.includes('__CLINE_FIND_NOT_FOUND__')) {
        throw new Error(`Path not found: ${inputPath}`);
      }

      return output
        .split('\n')
        .filter(Boolean)
        .map(absolutePath => {
          if (absolutePath === target) {
            return path.posix.basename(absolutePath);
          }
          return path.posix.relative(target, absolutePath);
        })
        .filter(
          candidate =>
            candidate.length > 0 && path.matchesGlob(candidate, pattern),
        )
        .sort((left, right) =>
          left.toLowerCase().localeCompare(right.toLowerCase()),
        )
        .slice(0, limit);
    },

    async ls(inputPath = '.', limit = 500) {
      const target = resolvePath(inputPath);
      const result = await runShell(
        [
          `if [ ! -e ${shellQuote(
            target,
          )} ]; then echo "__CLINE_LS_NOT_FOUND__"; exit 2; fi`,
          `if [ ! -d ${shellQuote(
            target,
          )} ]; then echo "__CLINE_LS_NOT_DIR__"; exit 3; fi`,
          `cd ${shellQuote(target)}`,
          'ls -1Ap',
        ].join('; '),
      );

      const output = result.output.trim();
      if (output.includes('__CLINE_LS_NOT_FOUND__')) {
        throw new Error(`Path not found: ${inputPath}`);
      }
      if (output.includes('__CLINE_LS_NOT_DIR__')) {
        throw new Error(`Not a directory: ${inputPath}`);
      }

      return output
        .split('\n')
        .filter(Boolean)
        .map(line => line.replace(/[*=@|]$/, ''))
        .sort((left, right) =>
          left.toLowerCase().localeCompare(right.toLowerCase()),
        )
        .slice(0, limit);
    },
  };
}
