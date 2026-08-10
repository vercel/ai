import path from 'node:path';
import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { createPiPathMapper, type PiPathMapper } from './pi-paths';

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
}

function escapeFindPathPattern(input: string): string {
  return [...input]
    .map(character => {
      switch (character) {
        case '\\':
          return '[\\\\]';
        case '*':
          return '[*]';
        case '?':
          return '[?]';
        case '[':
          return '[[]';
        case ']':
          return '[]]';
        default:
          return character;
      }
    })
    .join('');
}

function buildFindPruneExpression(deniedRoots: readonly string[]): string {
  if (deniedRoots.length === 0) return '';
  return `\\( ${deniedRoots
    .map(root => `-path ${shellQuote(escapeFindPathPattern(root))}`)
    .join(' -o ')} \\) -prune -o `;
}

interface ResolvedSandboxPath {
  readonly path: string;
  readonly paths: PiPathMapper;
}

// `realpath` is not available in every supported sandbox (notably just-bash),
// so resolve physical parents and final symlink chains using portable commands.
const canonicalizeSandboxPathScript = `pi_resolve_path() {
  candidate=$1
  count=0
  while :; do
    if [ "$candidate" = "/" ]; then printf '/\\n'; return 0; fi
    dir=$(dirname "$candidate") || return 1
    base=$(basename "$candidate") || return 1
    resolved_dir=$(cd -P "$dir" 2>/dev/null && pwd -P) || return 1
    candidate="$resolved_dir/$base"
    if [ ! -L "$candidate" ]; then printf '%s\\n' "$candidate"; return 0; fi
    count=$((count + 1))
    if [ "$count" -gt 40 ]; then return 1; fi
    link=$(readlink "$candidate") || return 1
    case "$link" in
      /*) candidate="$link" ;;
      *) candidate="$resolved_dir/$link" ;;
    esac
  done
}`;

const resolvePotentialSandboxPathScript = `pi_resolve_potential_path() {
  target=$1
  if [ -e "$target" ] || [ -L "$target" ]; then
    pi_resolve_path "$target"
    return
  fi
  dir=$(dirname "$target") || return 1
  base=$(basename "$target") || return 1
  missing="$base"
  while [ ! -e "$dir" ] && [ ! -L "$dir" ]; do
    parent=$(dirname "$dir") || return 1
    if [ "$parent" = "$dir" ]; then return 1; fi
    missing="$(basename "$dir")/$missing"
    dir="$parent"
  done
  resolved_dir=$(pi_resolve_path "$dir") || return 1
  if [ "$resolved_dir" = "/" ]; then
    printf '/%s\\n' "$missing"
  else
    printf '%s/%s\\n' "$resolved_dir" "$missing"
  fi
}`;

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

    const combined = `${result.stdout}${result.stderr}`;
    const output = Buffer.from(combined, 'utf8');
    if (output.length > 0) {
      input.onData?.(output);
    }

    return {
      exitCode: result.exitCode,
      output,
    };
  };

  const resolveSandboxPath = async (
    remotePath: string,
    inputPath: string,
    mustExist: boolean,
  ): Promise<ResolvedSandboxPath> => {
    const roots = [
      ...new Set([
        options.paths.sandboxWorkDir,
        ...options.paths.readableSandboxRoots,
        ...options.paths.writableSandboxRoots,
        ...options.paths.deniedSandboxRoots,
      ]),
    ];
    const result = await runShell(
      [
        canonicalizeSandboxPathScript,
        resolvePotentialSandboxPathScript,
        `target=${shellQuote(remotePath)}`,
        ...(mustExist
          ? [
              `if [ ! -e "$target" ]; then echo "__PI_REALPATH_NOT_FOUND__"; exit 2; fi`,
              `resolved=$(pi_resolve_path "$target") || { echo "__PI_REALPATH_FAILED__"; exit 3; }`,
            ]
          : [
              `resolved=$(pi_resolve_potential_path "$target") || { echo "__PI_REALPATH_FAILED__"; exit 3; }`,
            ]),
        `printf '__PI_RESOLVED_TARGET__%s\\n' "$resolved"`,
        ...roots.flatMap((root, index) => [
          `target=${shellQuote(root)}`,
          `resolved=$(pi_resolve_potential_path "$target") || { printf '__PI_POLICY_ROOT_FAILED__${index}\\n'; exit 3; }`,
          `printf '__PI_POLICY_ROOT_${index}__%s\\n' "$resolved"`,
        ]),
      ].join('\n'),
    );
    const output = result.output.toString('utf8');
    const outputLines = output.split('\n');
    if (outputLines.includes('__PI_REALPATH_NOT_FOUND__')) {
      throw new Error(`Path not found: ${inputPath}`);
    }
    if (outputLines.includes('__PI_REALPATH_FAILED__')) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }
    const failedIndex = outputLines
      .find(line => line.startsWith('__PI_POLICY_ROOT_FAILED__'))
      ?.slice('__PI_POLICY_ROOT_FAILED__'.length);
    if (result.exitCode !== 0) {
      const failedRoot =
        failedIndex === undefined ? undefined : roots[Number(failedIndex)];
      throw new Error(
        failedRoot
          ? `Unable to resolve configured root: ${failedRoot}`
          : 'Unable to resolve configured file-tool roots',
      );
    }

    const targetMarker = '__PI_RESOLVED_TARGET__';
    const resolvedTargetLine = outputLines.find(line =>
      line.startsWith(targetMarker),
    );
    if (!resolvedTargetLine) {
      throw new Error(`Unable to resolve path: ${inputPath}`);
    }
    const resolvedTarget = resolvedTargetLine.slice(targetMarker.length);

    const resolvedRoots = new Map<string, string>();
    for (const [index, root] of roots.entries()) {
      const marker = `__PI_POLICY_ROOT_${index}__`;
      const line = outputLines.find(line => line.startsWith(marker));
      if (!line) {
        throw new Error(`Unable to resolve configured root: ${root}`);
      }
      resolvedRoots.set(root, line.slice(marker.length));
    }

    const resolvedRoot = (root: string): string => {
      const resolved = resolvedRoots.get(root);
      if (!resolved) {
        throw new Error(`Unable to resolve configured root: ${root}`);
      }
      return resolved;
    };

    const resolvedPaths = createPiPathMapper({
      hostWorkDir: options.paths.hostWorkDir,
      sandboxWorkDir: resolvedRoot(options.paths.sandboxWorkDir),
      readableRoots: options.paths.readableSandboxRoots.map(sandboxDir => ({
        sandboxDir: resolvedRoot(sandboxDir),
      })),
      fileToolPathPolicy: {
        writableRoots: options.paths.writableSandboxRoots.map(resolvedRoot),
        deniedRoots: options.paths.deniedSandboxRoots.map(resolvedRoot),
      },
    });
    return {
      path: mustExist
        ? resolvedPaths.assertReadableSandboxPath(resolvedTarget)
        : resolvedPaths.assertSandboxPath(resolvedTarget),
      paths: resolvedPaths,
    };
  };

  const resolveReadableSandboxPath = (
    remotePath: string,
    inputPath: string,
  ): Promise<ResolvedSandboxPath> =>
    resolveSandboxPath(remotePath, inputPath, true);

  const resolveWritableSandboxPath = (
    remotePath: string,
    inputPath: string,
  ): Promise<ResolvedSandboxPath> =>
    resolveSandboxPath(remotePath, inputPath, false);

  const getDeniedRootsWithin = (
    remotePath: string,
    resolved: ResolvedSandboxPath,
  ): string[] => [
    ...new Set([
      ...options.paths
        .getDeniedSandboxRootsWithin(remotePath)
        .map(root =>
          path.posix.join(resolved.path, path.posix.relative(remotePath, root)),
        ),
      ...resolved.paths.getDeniedSandboxRootsWithin(resolved.path),
    ]),
  ];

  const readBuffer = async (inputPath: string): Promise<Buffer> => {
    const remotePath = options.paths.toReadableSandboxPath(inputPath);
    const resolved = await resolveReadableSandboxPath(remotePath, inputPath);
    const bytes = await options.sandbox.readBinaryFile({
      path: resolved.path,
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
    const resolved = await resolveWritableSandboxPath(remotePath, inputPath);
    const previous = await options.sandbox.readBinaryFile({
      path: resolved.path,
    });
    await runShell(`mkdir -p ${shellQuote(path.posix.dirname(resolved.path))}`);
    await options.sandbox.writeTextFile({ path: resolved.path, content });
    if (resolved.paths.isWorkspacePath(resolved.path)) {
      options.onFileChange?.(
        previous ? 'modify' : 'create',
        resolved.paths.toRelativePath(resolved.path),
        Buffer.from(content, 'utf8'),
      );
    }
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
    const resolved = await resolveReadableSandboxPath(remotePath, inputPath);
    const deniedDirectEntries = new Set(
      getDeniedRootsWithin(remotePath, resolved)
        .map(root => path.posix.relative(resolved.path, root))
        .filter(relative => relative.length > 0 && !relative.includes('/')),
    );
    const result = await runShell(
      [
        `if [ ! -e ${shellQuote(resolved.path)} ]; then echo "__PI_LS_NOT_FOUND__"; exit 2; fi`,
        `if [ ! -d ${shellQuote(resolved.path)} ]; then echo "__PI_LS_NOT_DIR__"; exit 3; fi`,
        `cd ${shellQuote(resolved.path)}`,
        `ls -1A | while IFS= read -r entry; do if [ -d "$entry" ]; then printf '%s/\\n' "$entry"; else printf '%s\\n' "$entry"; fi; done`,
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
      .filter(line => {
        const entryName = line.endsWith('/')
          ? line.slice(0, -1)
          : line.replace(/[*=@|]$/, '');
        return !deniedDirectEntries.has(entryName);
      })
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
    const resolved = await resolveReadableSandboxPath(remotePath, inputPath);
    const pruneExpression = buildFindPruneExpression(
      getDeniedRootsWithin(remotePath, resolved),
    );
    const result = await runShell(
      [
        `if [ ! -e ${shellQuote(resolved.path)} ]; then echo "__PI_FIND_NOT_FOUND__"; exit 2; fi`,
        `if [ -d ${shellQuote(resolved.path)} ]; then find ${shellQuote(resolved.path)} ${pruneExpression}-type f -print; else printf '%s\\n' ${shellQuote(resolved.path)}; fi`,
      ].join('; '),
    );

    const output = result.output.toString('utf8').trim();
    if (output.includes('__PI_FIND_NOT_FOUND__')) {
      throw new Error(`Path not found: ${inputPath}`);
    }

    const searchRoot = resolved.path;
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
    const resolved = await resolveReadableSandboxPath(
      remotePath,
      input.path ?? '.',
    );
    const pruneExpression = buildFindPruneExpression(
      getDeniedRootsWithin(remotePath, resolved),
    );
    const flags = [
      '-n',
      ...(input.ignoreCase ? ['-i'] : []),
      ...(input.literal ? ['-F'] : []),
      ...(typeof input.context === 'number' && input.context > 0
        ? ['-C', String(input.context)]
        : []),
    ];
    const nameExpression = input.glob ? ` -name ${shellQuote(input.glob)}` : '';
    const limit = Math.max(1, input.limit ?? 100);
    const result = await runShell(
      [
        `if [ ! -e ${shellQuote(resolved.path)} ]; then echo "__PI_GREP_NOT_FOUND__"; exit 2; fi`,
        `cd ${shellQuote(resolved.paths.sandboxWorkDir)}`,
        `binary_flag=''; if grep --help 2>&1 | grep -q -e 'binary-files'; then binary_flag='--binary-files=without-match'; fi`,
        `find ${shellQuote(resolved.path)} ${pruneExpression}-type f${nameExpression} -exec grep ${flags.map(shellQuote).join(' ')} $binary_flag -e ${shellQuote(pattern)} /dev/null {} + 2>/dev/null | head -n ${limit}`,
      ].join('; '),
    );

    const output = result.output.toString('utf8').trim();
    if (output.includes('__PI_GREP_NOT_FOUND__')) {
      throw new Error(`Path not found: ${input.path ?? '.'}`);
    }

    if (!output) return 'No matches found';
    if (!resolved.paths.isWorkspacePath(resolved.path)) return output;

    const workspacePrefix = `${resolved.paths.sandboxWorkDir}/`;
    return output
      .split('\n')
      .map(line =>
        line.startsWith(workspacePrefix)
          ? line.slice(workspacePrefix.length)
          : line,
      )
      .join('\n');
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
