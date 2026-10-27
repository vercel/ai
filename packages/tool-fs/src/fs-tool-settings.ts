import type {
  Experimental_SandboxSession as SandboxSession,
  Tool,
  ToolExecuteFunction,
} from 'ai';
import { posix } from 'node:path';
import { z } from 'zod/v4';

/**
 * Settings shared by all filesystem tools created by one `createFsTools` call.
 */
export type FsToolSettings = {
  workingDirectory: string | undefined;
  maxFileSize: number;
  maxReadLength: number;
  maxResults: number;
  timeout: number;
};

export type FsTool<INPUT, OUTPUT> = Tool<INPUT, OUTPUT, {}> & {
  execute: ToolExecuteFunction<INPUT, OUTPUT, {}>;
};

// Maximum number of lines `read` returns when the model does not pass `limit`.
export const MAX_READ_LINES = 2000;

// Lines longer than this are truncated in `read`, `grep`, and `glob` output.
export const MAX_LINE_LENGTH = 2000;

// Maximum number of entries `list` returns.
export const MAX_LIST_ENTRIES = 1000;

// Exit code the shell scripts of `glob` and `grep` use to report that the
// search path does not exist. ripgrep, grep, and find never use it.
export const PATH_NOT_FOUND_EXIT_CODE = 3;

// Exit code the shell script of `grep` uses to report an invalid pattern.
export const INVALID_PATTERN_EXIT_CODE = 4;

export function errorSchema<const CODES extends readonly [string, ...string[]]>(
  errorCodes: CODES,
) {
  return z.object({
    type: z.literal('error'),
    path: z.string(),
    errorCode: z.enum(errorCodes),
    message: z.string(),
  });
}

export function getSandbox(
  sandbox: SandboxSession | undefined,
): SandboxSession {
  if (sandbox === undefined) {
    throw new Error(
      'The filesystem tools require a sandbox. Pass `experimental_sandbox` ' +
        'to generateText, streamText, or the agent.',
    );
  }
  return sandbox;
}

/**
 * Resolve a path from the model against the configured working directory.
 * Without a working directory, relative paths are passed to the sandbox as is
 * and resolve against its default working directory.
 */
export function resolvePath({
  settings,
  path,
}: {
  settings: FsToolSettings;
  path: string;
}): string {
  return settings.workingDirectory === undefined || posix.isAbsolute(path)
    ? path
    : posix.join(settings.workingDirectory, path);
}

/**
 * Run sandbox operations with the tool timeout combined with the caller's
 * abort signal. Returns `onTimeout()` when the timeout fires, even if the
 * sandbox ignores the signal. Caller aborts and other errors are rethrown.
 */
export async function withTimeout<RESULT>({
  settings,
  abortSignal,
  operation,
  onTimeout,
}: {
  settings: FsToolSettings;
  abortSignal: AbortSignal | undefined;
  operation: (abortSignal: AbortSignal) => Promise<RESULT>;
  onTimeout: (message: string) => RESULT;
}): Promise<RESULT> {
  const timeoutSignal = AbortSignal.timeout(settings.timeout);
  const signal =
    abortSignal === undefined
      ? timeoutSignal
      : AbortSignal.any([abortSignal, timeoutSignal]);

  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    });
  });
  // The race below may settle first; avoid an unhandled rejection later.
  aborted.catch(() => {});

  try {
    signal.throwIfAborted();
    return await Promise.race([operation(signal), aborted]);
  } catch (error) {
    if (abortSignal?.aborted !== true && timeoutSignal.aborted) {
      return onTimeout(`The operation timed out after ${settings.timeout} ms.`);
    }
    throw error;
  }
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Quote a path for use as a command argument. Relative paths that start with
 * `-` are prefixed with `./` so commands do not parse them as options; not all
 * sandboxes support `--`.
 */
export function shellQuotePath(path: string): string {
  return shellQuote(path.startsWith('-') ? `./${path}` : path);
}

export function truncateLine(line: string): string {
  return line.length <= MAX_LINE_LENGTH
    ? line
    : `${line.slice(0, MAX_LINE_LENGTH)}… [line truncated]`;
}

/**
 * Remove the `./` prefix that `find` and some ripgrep versions add to paths
 * found under `.`.
 */
export function stripDotSlash(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path;
}
