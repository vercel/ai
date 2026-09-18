import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import type { PiPathMapper } from './pi-paths';

export type PiRemoteFileChangeKind = 'create' | 'modify';

export interface PiRemoteOpsOptions {
  readonly sandbox: Experimental_SandboxSession;
  readonly paths: PiPathMapper;
  readonly env?: Record<string, string>;
  readonly onFileChange?: (
    event: PiRemoteFileChangeKind,
    relativePath: string,
    content: Buffer,
  ) => void;
}

export interface PiRemoteOps {
  readonly paths: PiPathMapper;
  readBuffer(inputPath: string): Promise<Buffer>;
  writeFile(inputPath: string, content: string): Promise<void>;
  editFile(
    inputPath: string,
    oldText: string,
    newText: string,
  ): Promise<string>;
  listDirectory(inputPath?: string, limit?: number): Promise<string[]>;
  findFiles(
    pattern: string,
    inputPath?: string,
    limit?: number,
  ): Promise<string[]>;
  grepFiles(
    pattern: string,
    input: {
      path?: string;
      glob?: string;
      ignoreCase?: boolean;
      literal?: boolean;
      context?: number;
      limit?: number;
    },
  ): Promise<string>;
  access(inputPath: string): Promise<void>;
  exec(
    command: string,
    cwd: string,
    input: {
      onData: (data: Buffer) => void;
      signal?: AbortSignal;
      timeout?: number;
    },
  ): Promise<{ exitCode: number | null }>;
}

interface RunShellInput {
  cwd?: string;
  signal?: AbortSignal;
  onData?: (data: Buffer) => void;
}

interface RunShellResult {
  exitCode: number | null;
  output: Buffer;
  stdout: string;
  stderr: string;
}

const MAX_GREP_DIAGNOSTIC_BYTES = 8_192;

function lastOutputLine(output: Buffer): string | undefined {
  return output.toString('utf8').trim().split('\n').filter(Boolean).at(-1);
}

export function createPiRemoteOps(options: PiRemoteOpsOptions): PiRemoteOps {
  const runShell = async (
    command: string,
    input: RunShellInput = {},
  ): Promise<RunShellResult> => {
    // `sandbox.run({ command })` already wraps in `bash -c`; we pass the
    // shell snippet directly. shellQuote is still used inside `command`
    // for path/value interpolation by the callers.
    const result = await options.sandbox.run({
      command,
      ...(input.cwd
        ? { workingDirectory: options.paths.toSandboxPath(input.cwd) }
        : {}),
      ...(options.env ? { env: options.env } : {}),
      ...(input.signal ? { abortSignal: input.signal } : {}),
    });

    const output = Buffer.from(`${result.stdout}${result.stderr}`, 'utf8');
    if (output.length > 0) {
      input.onData?.(output);
    }

    return {
      exitCode: result.exitCode,
      output,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };

  const resolveExistingSandboxPath = async (
    remotePath: string,
    inputPath: string,
  ): Promise<string> => {
    const result = await runShell(
      [
        `target=${shellQuote(remotePath)}`,
        `if [ ! -e "$target" ]; then echo "__PI_REALPATH_NOT_FOUND__"; exit 2; fi`,
        `resolved=$(realpath "$target" 2>/dev/null) || { echo "__PI_REALPATH_FAILED__"; exit 3; }`,
        `printf '%s\\n' "$resolved"`,
      ].join('; '),
    );

    const output = result.output.toString('utf8');
    if (output.includes('__PI_REALPATH_NOT_FOUND__')) {
      throw new Error(`Path not found: ${inputPath}`);
    }
    if (output.includes('__PI_REALPATH_FAILED__') || result.exitCode !== 0) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }

    const resolvedPath = lastOutputLine(result.output);
    if (!resolvedPath) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }
    return resolvedPath;
  };

  const resolveReadableSandboxPath = async (
    remotePath: string,
    inputPath: string,
  ): Promise<string> =>
    options.paths.assertReadableSandboxPath(
      await resolveExistingSandboxPath(remotePath, inputPath),
    );

  const resolveWritableSandboxPath = async (
    remotePath: string,
    inputPath: string,
  ): Promise<string> => {
    const result = await runShell(
      [
        `target=${shellQuote(remotePath)}`,
        `if [ -e "$target" ] || [ -L "$target" ]; then resolved=$(realpath "$target" 2>/dev/null) || { echo "__PI_REALPATH_FAILED__"; exit 3; }; printf '%s\\n' "$resolved"; exit 0; fi`,
        `dir=$(dirname "$target")`,
        `base=$(basename "$target")`,
        `missing="$base"`,
        `while [ ! -e "$dir" ] && [ ! -L "$dir" ]; do parent=$(dirname "$dir"); if [ "$parent" = "$dir" ]; then echo "__PI_REALPATH_NOT_FOUND__"; exit 2; fi; missing="$(basename "$dir")/$missing"; dir="$parent"; done`,
        `resolved_dir=$(realpath "$dir" 2>/dev/null) || { echo "__PI_REALPATH_FAILED__"; exit 3; }`,
        `printf '%s/%s\\n' "$resolved_dir" "$missing"`,
      ].join('; '),
    );

    const output = result.output.toString('utf8');
    if (
      output.includes('__PI_REALPATH_NOT_FOUND__') ||
      output.includes('__PI_REALPATH_FAILED__') ||
      result.exitCode !== 0
    ) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }

    const resolvedPath = lastOutputLine(result.output);
    if (!resolvedPath) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }
    return options.paths.assertSandboxPath(resolvedPath);
  };

  const readBuffer = async (inputPath: string): Promise<Buffer> => {
    const remotePath = options.paths.toReadableSandboxPath(inputPath);
    const resolvedPath = await resolveReadableSandboxPath(
      remotePath,
      inputPath,
    );
    const bytes = await options.sandbox.readBinaryFile({
      path: resolvedPath,
    });
    if (!bytes) {
      throw new Error(`Path not found: ${inputPath}`);
    }
    return Buffer.from(bytes);
  };

  const writeFile = async (
    inputPath: string,
    content: string,
  ): Promise<void> => {
    const remotePath = options.paths.toSandboxPath(inputPath);
    const resolvedPath = await resolveWritableSandboxPath(
      remotePath,
      inputPath,
    );
    const previous = await options.sandbox.readBinaryFile({
      path: resolvedPath,
    });
    await runShell(`mkdir -p ${shellQuote(path.posix.dirname(resolvedPath))}`);
    await options.sandbox.writeTextFile({ path: resolvedPath, content });
    options.onFileChange?.(
      previous ? 'modify' : 'create',
      options.paths.toRelativePath(resolvedPath),
      Buffer.from(content, 'utf8'),
    );
  };

  const editFile = async (
    inputPath: string,
    oldText: string,
    newText: string,
  ): Promise<string> => {
    const current = (await readBuffer(inputPath)).toString('utf8');
    const index = current.indexOf(oldText);
    if (index === -1) {
      throw new Error(`Text to replace was not found in ${inputPath}`);
    }
    const updated = `${current.slice(0, index)}${newText}${current.slice(
      index + oldText.length,
    )}`;
    await writeFile(inputPath, updated);
    return updated;
  };

  const listDirectory = async (
    inputPath: string = '.',
    limit: number = 500,
  ): Promise<string[]> => {
    const remotePath = options.paths.toReadableSandboxPath(inputPath);
    const resolvedPath = await resolveReadableSandboxPath(
      remotePath,
      inputPath,
    );
    const result = await runShell(
      [
        `if [ ! -e ${shellQuote(resolvedPath)} ]; then echo "__PI_LS_NOT_FOUND__"; exit 2; fi`,
        `if [ ! -d ${shellQuote(resolvedPath)} ]; then echo "__PI_LS_NOT_DIR__"; exit 3; fi`,
        `cd ${shellQuote(resolvedPath)}`,
        'ls -1AF',
      ].join('; '),
    );

    const output = result.output.toString('utf8').trim();
    if (output.includes('__PI_LS_NOT_FOUND__')) {
      throw new Error(`Path not found: ${inputPath}`);
    }
    if (output.includes('__PI_LS_NOT_DIR__')) {
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
  };

  const findFiles = async (
    pattern: string,
    inputPath: string = '.',
    limit: number = 1_000,
  ): Promise<string[]> => {
    const remotePath = options.paths.toReadableSandboxPath(inputPath);
    const resolvedPath = await resolveReadableSandboxPath(
      remotePath,
      inputPath,
    );
    const result = await runShell(
      [
        `if [ ! -e ${shellQuote(resolvedPath)} ]; then echo "__PI_FIND_NOT_FOUND__"; exit 2; fi`,
        `if [ -d ${shellQuote(resolvedPath)} ]; then find ${shellQuote(resolvedPath)} -type f -print; else printf '%s\\n' ${shellQuote(resolvedPath)}; fi`,
      ].join('; '),
    );

    const output = result.output.toString('utf8').trim();
    if (output.includes('__PI_FIND_NOT_FOUND__')) {
      throw new Error(`Path not found: ${inputPath}`);
    }

    const searchRoot = resolvedPath;
    return output
      .split('\n')
      .filter(Boolean)
      .map(absolutePath => {
        if (absolutePath === searchRoot) {
          return path.posix.basename(absolutePath);
        }
        return path.posix.relative(searchRoot, absolutePath);
      })
      .filter(
        candidate =>
          candidate.length > 0 && path.matchesGlob(candidate, pattern),
      )
      .sort((left, right) =>
        left.toLowerCase().localeCompare(right.toLowerCase()),
      )
      .slice(0, limit);
  };

  const grepFiles = async (
    pattern: string,
    input: {
      path?: string;
      glob?: string;
      ignoreCase?: boolean;
      literal?: boolean;
      context?: number;
      limit?: number;
    },
  ): Promise<string> => {
    const remotePath = options.paths.toReadableSandboxPath(input.path ?? '.');
    const resolvedPath = await resolveReadableSandboxPath(
      remotePath,
      input.path ?? '.',
    );
    const relativeTarget = options.paths.toRelativePath(resolvedPath);
    const targetPath =
      relativeTarget.startsWith('../') || path.posix.isAbsolute(relativeTarget)
        ? resolvedPath
        : relativeTarget.startsWith('-')
          ? `./${relativeTarget}`
          : relativeTarget;
    const limit = Math.max(1, input.limit ?? 100);
    const commonFlags = [
      '-n',
      ...(input.ignoreCase ? ['-i'] : []),
      ...(input.literal ? ['-F'] : []),
      ...(typeof input.context === 'number' && input.context > 0
        ? ['-C', String(input.context)]
        : []),
    ];
    const recursiveFlags = [
      '-r',
      ...commonFlags,
      '-m',
      String(limit),
      ...(input.glob ? [`--include=${input.glob}`] : []),
    ];
    const temporaryPathPrefix = `/tmp/.ai-sdk-harness-pi-grep-${randomUUID()}`;
    const outputPath = `${temporaryPathPrefix}.stdout`;
    const stderrPath = `${temporaryPathPrefix}.stderr`;
    const statusPath = `${temporaryPathPrefix}.status`;
    const fileOutputPath = `${temporaryPathPrefix}.file.stdout`;
    const fileStderrPath = `${temporaryPathPrefix}.file.stderr`;
    const findStderrPath = `${temporaryPathPrefix}.find.stderr`;
    const boundedFileGrepScript = [
      `grep_limit=${limit}`,
      `grep_output=${shellQuote(outputPath)}`,
      `grep_stderr=${shellQuote(stderrPath)}`,
      `grep_status=${shellQuote(statusPath)}`,
      `grep_file_output=${shellQuote(fileOutputPath)}`,
      `grep_file_stderr=${shellQuote(fileStderrPath)}`,
      'grep_output_lines=$(wc -l < "$grep_output")',
      'grep_overall_status=$(cat "$grep_status")',
      'for grep_file in "$@"; do',
      'grep_remaining=$((grep_limit - grep_output_lines))',
      'if [ "$grep_remaining" -le 0 ]; then break; fi',
      `grep ${commonFlags.map(shellQuote).join(' ')} -m "$grep_remaining" -e ${shellQuote(pattern)} "$grep_file" > "$grep_file_output" 2> "$grep_file_stderr"`,
      'grep_file_status=$?',
      'if [ "$grep_file_status" -eq 0 ]; then',
      'grep_display_file=${grep_file#./}',
      'grep_file_lines=0',
      'while IFS= read -r grep_line; do',
      'if [ "$grep_file_lines" -ge "$grep_remaining" ]; then break; fi',
      'case "$grep_line" in',
      `'--') printf '%s\\n' "$grep_line" ;;`,
      `[0-9]*:*) printf '%s:%s\\n' "$grep_display_file" "$grep_line" ;;`,
      `[0-9]*-*) printf '%s-%s\\n' "$grep_display_file" "$grep_line" ;;`,
      `*) printf '%s:%s\\n' "$grep_display_file" "$grep_line" ;;`,
      'esac',
      'grep_file_lines=$((grep_file_lines + 1))',
      'done < "$grep_file_output" >> "$grep_output"',
      'grep_output_lines=$((grep_output_lines + grep_file_lines))',
      'grep_overall_status=0',
      'elif [ "$grep_file_status" -gt 1 ]; then',
      `grep_diagnostic_size=$(wc -c < "$grep_stderr")`,
      `grep_diagnostic_remaining=$((${MAX_GREP_DIAGNOSTIC_BYTES} - grep_diagnostic_size))`,
      'if [ "$grep_diagnostic_remaining" -gt 0 ]; then head -c "$grep_diagnostic_remaining" "$grep_file_stderr" >> "$grep_stderr"; fi',
      'grep_overall_status=2',
      'break',
      'fi',
      'done',
      'printf \'%s\\n\' "$grep_overall_status" > "$grep_status"',
    ].join('\n');
    const findFlags = [
      shellQuote(targetPath),
      '-type',
      'f',
      ...(input.glob ? ['-name', shellQuote(input.glob)] : []),
    ].join(' ');
    const result = await runShell(
      [
        `if [ ! -e ${shellQuote(resolvedPath)} ]; then echo "__PI_GREP_NOT_FOUND__"; exit 2; fi`,
        `cd ${shellQuote(options.paths.sandboxWorkDir)}`,
        // Preserve binary skipping where grep supports it without passing an
        // unsupported option to just-bash.
        `binary_option_error=$(grep --binary-files=without-match -e '' /dev/null 2>&1)`,
        `if [ -z "$binary_option_error" ]; then binary_option='--binary-files=without-match'; else binary_option=''; fi`,
        `grep_stderr=${shellQuote(stderrPath)}`,
        `grep_output=${shellQuote(outputPath)}`,
        `grep_status_file=${shellQuote(statusPath)}`,
        `grep_find_stderr=${shellQuote(findStderrPath)}`,
        ': > "$grep_stderr"',
        // just-bash buffers every pipeline stage and applies grep -m per file.
        // Search files individually there so the producer never emits more
        // than the remaining global result limit.
        `if [ -n "$binary_option" ] || [ ! -d ${shellQuote(targetPath)} ]; then set -o pipefail; grep $binary_option ${recursiveFlags.map(shellQuote).join(' ')} -e ${shellQuote(pattern)} ${shellQuote(targetPath)} 2>"$grep_stderr" | head -n ${limit}; grep_status=$?; else : > "$grep_output"; printf '1\\n' > "$grep_status_file"; find ${findFlags} -exec bash -c ${shellQuote(boundedFileGrepScript)} bash {} + 2>"$grep_find_stderr"; find_status=$?; grep_diagnostic_size=$(wc -c < "$grep_stderr"); grep_diagnostic_remaining=$((${MAX_GREP_DIAGNOSTIC_BYTES} - grep_diagnostic_size)); if [ "$grep_diagnostic_remaining" -gt 0 ]; then head -c "$grep_diagnostic_remaining" "$grep_find_stderr" >> "$grep_stderr"; fi; grep_status=$(cat "$grep_status_file"); if [ "$find_status" -ne 0 ]; then grep_status=2; fi; cat "$grep_output"; fi`,
        `head -c ${MAX_GREP_DIAGNOSTIC_BYTES} "$grep_stderr" >&2`,
        `rm -f ${[
          outputPath,
          stderrPath,
          statusPath,
          fileOutputPath,
          fileStderrPath,
          findStderrPath,
        ]
          .map(shellQuote)
          .join(' ')}`,
        'exit "$grep_status"',
      ].join('; '),
    );

    const output = result.output.toString('utf8').trim();
    if (output.includes('__PI_GREP_NOT_FOUND__')) {
      throw new Error(`Path not found: ${input.path ?? '.'}`);
    }
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();

    if (
      result.exitCode === 0 ||
      result.exitCode === 1 ||
      // GNU grep can receive SIGPIPE after head reaches the requested limit.
      result.exitCode === 141
    ) {
      if (stdout) {
        return [stdout, stderr].filter(Boolean).join('\n');
      }
      if (stderr) {
        throw new Error(stderr);
      }
      return 'No matches found';
    }

    // GNU grep exits 2 when recursive traversal encounters unreadable entries,
    // even if it also found useful matches in readable files.
    if (result.exitCode === 2 && stdout && stderr) {
      return `${stdout}\n${stderr}`;
    }
    if (stderr) {
      throw new Error(stderr);
    }
    throw new Error(output || `grep failed with exit code ${result.exitCode}`);
  };

  return {
    paths: options.paths,
    readBuffer,
    writeFile,
    editFile,
    listDirectory,
    findFiles,
    grepFiles,
    async access(inputPath: string) {
      await readBuffer(inputPath);
    },
    async exec(command, cwd, input): Promise<{ exitCode: number | null }> {
      const controller = new AbortController();
      // `input.timeout` is expressed in seconds (Pi's `bash` tool contract),
      // so convert to milliseconds for `setTimeout`.
      const timeoutId =
        typeof input.timeout === 'number' && input.timeout > 0
          ? setTimeout(() => controller.abort(), input.timeout * 1000)
          : undefined;

      const forwardedSignal = input.signal;
      const onAbort = () => controller.abort();
      forwardedSignal?.addEventListener('abort', onAbort, { once: true });

      try {
        const result = await runShell(command, {
          cwd,
          signal: controller.signal,
          onData: input.onData,
        });
        return { exitCode: result.exitCode };
      } finally {
        forwardedSignal?.removeEventListener('abort', onAbort);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    },
  };
}
