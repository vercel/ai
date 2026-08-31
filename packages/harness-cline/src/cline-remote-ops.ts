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
  const normalizedWorkDir = path.posix.normalize(workDir);

  const isInsidePath = ({
    parent,
    candidate,
  }: {
    parent: string;
    candidate: string;
  }): boolean => {
    const relative = path.posix.relative(parent, candidate);
    return (
      relative === '' ||
      (relative !== '..' &&
        !relative.startsWith('../') &&
        !path.posix.isAbsolute(relative))
    );
  };

  const assertWorkspacePath = (inputPath: string): string => {
    const normalized = path.posix.normalize(inputPath);
    if (!isInsidePath({ parent: normalizedWorkDir, candidate: normalized })) {
      throw new Error(`Cline path escapes the workspace: ${inputPath}`);
    }
    return normalized;
  };

  const resolvePath = (inputPath: string): string => {
    const resolved = path.posix.isAbsolute(inputPath)
      ? path.posix.normalize(inputPath)
      : path.posix.normalize(path.posix.join(normalizedWorkDir, inputPath));
    return assertWorkspacePath(resolved);
  };

  const runShell = async ({
    command,
    signal,
  }: {
    command: string;
    signal?: AbortSignal;
  }): Promise<{ exitCode: number; output: string }> => {
    // `sandbox.run({ command })` already wraps in a shell; interpolated
    // paths/values inside `command` are quoted with `shellQuote` by callers.
    const result = await sandbox.run({
      command,
      workingDirectory: normalizedWorkDir,
      ...(signal ? { abortSignal: signal } : {}),
    });
    return {
      exitCode: result.exitCode,
      output: `${result.stdout}${result.stderr}`,
    };
  };

  const lastOutputLine = (output: string): string | undefined =>
    output.trim().split('\n').filter(Boolean).at(-1);

  const resolveExistingSandboxPath = async ({
    remotePath,
    inputPath,
    missingMessage,
  }: {
    remotePath: string;
    inputPath: string;
    missingMessage?: string;
  }): Promise<string> => {
    const result = await runShell({
      command: [
        `target=${shellQuote(remotePath)}`,
        'if [ ! -e "$target" ]; then echo "__CLINE_REALPATH_NOT_FOUND__"; exit 2; fi',
        'resolved=$(realpath "$target" 2>/dev/null) || { echo "__CLINE_REALPATH_FAILED__"; exit 3; }',
        'printf \'%s\\n\' "$resolved"',
      ].join('; '),
    });

    if (result.output.includes('__CLINE_REALPATH_NOT_FOUND__')) {
      throw new Error(missingMessage ?? `Path not found: ${inputPath}`);
    }
    if (
      result.output.includes('__CLINE_REALPATH_FAILED__') ||
      result.exitCode !== 0
    ) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }

    const resolvedPath = lastOutputLine(result.output);
    if (!resolvedPath) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }
    return resolvedPath;
  };

  const resolveReadableSandboxPath = async ({
    remotePath,
    inputPath,
    missingMessage,
  }: {
    remotePath: string;
    inputPath: string;
    missingMessage?: string;
  }): Promise<string> =>
    assertWorkspacePath(
      await resolveExistingSandboxPath({
        remotePath,
        inputPath,
        ...(missingMessage ? { missingMessage } : {}),
      }),
    );

  const resolveWritableSandboxPath = async ({
    remotePath,
    inputPath,
  }: {
    remotePath: string;
    inputPath: string;
  }): Promise<string> => {
    const result = await runShell({
      command: [
        `target=${shellQuote(remotePath)}`,
        'if [ -e "$target" ] || [ -L "$target" ]; then resolved=$(realpath "$target" 2>/dev/null) || { echo "__CLINE_REALPATH_FAILED__"; exit 3; }; printf \'%s\\n\' "$resolved"; exit 0; fi',
        'dir=$(dirname "$target")',
        'base=$(basename "$target")',
        'missing="$base"',
        'while [ ! -e "$dir" ] && [ ! -L "$dir" ]; do parent=$(dirname "$dir"); if [ "$parent" = "$dir" ]; then echo "__CLINE_REALPATH_NOT_FOUND__"; exit 2; fi; missing="$(basename "$dir")/$missing"; dir="$parent"; done',
        'resolved_dir=$(realpath "$dir" 2>/dev/null) || { echo "__CLINE_REALPATH_FAILED__"; exit 3; }',
        'printf \'%s/%s\\n\' "$resolved_dir" "$missing"',
      ].join('; '),
    });

    if (
      result.output.includes('__CLINE_REALPATH_NOT_FOUND__') ||
      result.output.includes('__CLINE_REALPATH_FAILED__') ||
      result.exitCode !== 0
    ) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }

    const resolvedPath = lastOutputLine(result.output);
    if (!resolvedPath) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }
    return assertWorkspacePath(resolvedPath);
  };

  const readFile = async (inputPath: string): Promise<string> => {
    const remotePath = resolvePath(inputPath);
    const resolved = await resolveReadableSandboxPath({
      remotePath,
      inputPath,
      missingMessage: `File not found: ${inputPath}`,
    });
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
    const remotePath = resolvePath(inputPath);
    const resolved = await resolveWritableSandboxPath({
      remotePath,
      inputPath,
    });
    // `writeTextFile` creates parent directories recursively per the
    // SandboxSession contract, so no explicit mkdir is needed.
    await sandbox.writeTextFile({ path: resolved, content });
  };

  const editFile = async (
    inputPath: string,
    oldText: string,
    newText: string,
  ): Promise<void> => {
    const remotePath = resolvePath(inputPath);
    const resolved = assertWorkspacePath(
      await resolveExistingSandboxPath({
        remotePath,
        inputPath,
        missingMessage: `File not found: ${inputPath}`,
      }),
    );
    const current = await sandbox.readTextFile({ path: resolved });
    if (current == null) {
      throw new Error(`File not found: ${inputPath}`);
    }
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
        const result = await runShell({
          command,
          signal: controller.signal,
        });
        return { output: result.output, exitCode: result.exitCode };
      } finally {
        forwardedSignal?.removeEventListener('abort', onAbort);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    },

    async grep(pattern, input = {}) {
      const inputPath = input.path ?? '.';
      const remotePath = resolvePath(inputPath);
      const target = await resolveReadableSandboxPath({
        remotePath,
        inputPath,
      });
      const flags = [
        '-r',
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
      const result = await runShell({
        command: [
          `if [ ! -e ${shellQuote(
            target,
          )} ]; then echo "__CLINE_GREP_NOT_FOUND__"; exit 2; fi`,
          `grep ${flags.map(shellQuote).join(' ')} -- ${shellQuote(
            pattern,
          )} ${shellQuote(target)} 2>/dev/null | head -n ${limit}`,
        ].join('; '),
      });

      const output = result.output.trim();
      if (output.includes('__CLINE_GREP_NOT_FOUND__')) {
        throw new Error(`Path not found: ${input.path ?? '.'}`);
      }
      return output || 'No matches found';
    },

    async glob(pattern, inputPath = '.', limit = 1_000) {
      const remotePath = resolvePath(inputPath);
      const target = await resolveReadableSandboxPath({
        remotePath,
        inputPath,
      });
      const result = await runShell({
        command: [
          `if [ ! -e ${shellQuote(
            target,
          )} ]; then echo "__CLINE_FIND_NOT_FOUND__"; exit 2; fi`,
          `if [ -d ${shellQuote(target)} ]; then find ${shellQuote(
            target,
          )} -type f -print; else printf '%s\\n' ${shellQuote(target)}; fi`,
        ].join('; '),
      });

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
      const remotePath = resolvePath(inputPath);
      const target = await resolveReadableSandboxPath({
        remotePath,
        inputPath,
      });
      const result = await runShell({
        command: [
          `if [ ! -e ${shellQuote(
            target,
          )} ]; then echo "__CLINE_LS_NOT_FOUND__"; exit 2; fi`,
          `if [ ! -d ${shellQuote(
            target,
          )} ]; then echo "__CLINE_LS_NOT_DIR__"; exit 3; fi`,
          `cd ${shellQuote(target)}`,
          'ls -1Ap',
        ].join('; '),
      });

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
