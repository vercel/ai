import path from 'node:path';
import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';

export type FxFileChange = {
  event: 'create' | 'modify' | 'delete';
  path: string;
};
export type FxWorkspaceSnapshot = Record<string, string>;

export function diffFxWorkspace(options: {
  before: FxWorkspaceSnapshot;
  after: FxWorkspaceSnapshot;
}): FxFileChange[] {
  return [
    ...new Set([...Object.keys(options.before), ...Object.keys(options.after)]),
  ]
    .sort()
    .flatMap(filePath => {
      const before = options.before[filePath];
      const after = options.after[filePath];
      if (before === after) return [];
      return [
        {
          event:
            before === undefined
              ? ('create' as const)
              : after === undefined
                ? ('delete' as const)
                : ('modify' as const),
          path: filePath,
        },
      ];
    });
}

export function createFxRemoteOps(options: {
  sandbox: SandboxSession;
  workDir: string;
}) {
  const { sandbox } = options;
  const workDir = path.posix.resolve(options.workDir);
  let canonicalRoot: Promise<string> | undefined;

  function assertContained(input: { root: string; candidate: string }): string {
    const relative = path.posix.relative(input.root, input.candidate);
    if (
      relative === '..' ||
      relative.startsWith('../') ||
      path.posix.isAbsolute(relative)
    ) {
      throw new Error(`fx path escapes the workspace: ${input.candidate}`);
    }
    return input.candidate;
  }

  async function run(input: { command: string; signal?: AbortSignal }) {
    input.signal?.throwIfAborted();
    return sandbox.run({
      command: input.command,
      workingDirectory: workDir,
      ...(input.signal ? { abortSignal: input.signal } : {}),
    });
  }

  async function realpath(input: {
    target: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const result = await run({
      command: `bash -o pipefail -c ${shellQuote(`realpath -mz -- ${shellQuote(input.target)} | base64`)}`,
      signal: input.signal,
    });
    if (result.exitCode !== 0 || !result.stdout.trim()) {
      throw new Error(`Unable to resolve sandbox path: ${input.target}`);
    }
    const decoded = Buffer.from(result.stdout.trim(), 'base64').toString(
      'utf8',
    );
    return decoded.endsWith('\0') ? decoded.slice(0, -1) : decoded;
  }

  async function resolvePath(input: {
    filePath: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const candidate = assertContained({
      root: workDir,
      candidate: path.posix.resolve(workDir, input.filePath),
    });
    canonicalRoot ??= realpath({ target: workDir });
    return assertContained({
      root: await canonicalRoot,
      candidate: await realpath({ target: candidate, signal: input.signal }),
    });
  }

  async function read(input: { file_path: string; signal?: AbortSignal }) {
    const filePath = await resolvePath({
      filePath: input.file_path,
      signal: input.signal,
    });
    const content = await sandbox.readTextFile({
      path: filePath,
      abortSignal: input.signal,
    });
    if (content == null) throw new Error(`File not found: ${input.file_path}`);
    return content;
  }

  async function write(input: {
    file_path: string;
    content: string;
    signal?: AbortSignal;
  }) {
    const filePath = await resolvePath({
      filePath: input.file_path,
      signal: input.signal,
    });
    await sandbox.writeTextFile({
      path: filePath,
      content: input.content,
      abortSignal: input.signal,
    });
    return `Wrote ${input.file_path}`;
  }

  async function edit(input: {
    file_path: string;
    old_string: string;
    new_string: string;
    signal?: AbortSignal;
  }) {
    const content = await read(input);
    const index = content.indexOf(input.old_string);
    if (index === -1 || input.old_string.length === 0)
      throw new Error('Text to replace was not found or is empty.');
    if (content.includes(input.old_string, index + input.old_string.length)) {
      throw new Error(
        'Text to replace occurs more than once. Include more context.',
      );
    }
    await write({
      ...input,
      content:
        content.slice(0, index) +
        input.new_string +
        content.slice(index + input.old_string.length),
    });
    return `Edited ${input.file_path}`;
  }

  async function bash(input: {
    command: string;
    timeout?: number;
    signal?: AbortSignal;
  }) {
    const signal =
      input.timeout != null && input.timeout > 0
        ? AbortSignal.any([
            ...(input.signal ? [input.signal] : []),
            AbortSignal.timeout(input.timeout * 1000),
          ])
        : input.signal;
    return run({ command: input.command, signal });
  }

  async function grep(input: {
    pattern: string;
    path?: string;
    glob?: string;
    ignoreCase?: boolean;
    literal?: boolean;
    context?: number;
    limit?: number;
    signal?: AbortSignal;
  }) {
    const target = await resolvePath({
      filePath: input.path ?? '.',
      signal: input.signal,
    });
    const flags = [
      '-r',
      '-n',
      '--binary-files=without-match',
      ...(input.ignoreCase ? ['-i'] : []),
      ...(input.literal ? ['-F'] : []),
      ...(input.glob ? [`--include=${input.glob}`] : []),
      ...(input.context ? ['-C', String(input.context)] : []),
    ];
    const result = await run({
      command: `grep ${flags.map(shellQuote).join(' ')} -- ${shellQuote(input.pattern)} ${shellQuote(target)} | head -n ${Math.max(1, Math.floor(input.limit ?? 100))}`,
      signal: input.signal,
    });
    return result.stdout || result.stderr || 'No matches found';
  }

  async function glob(input: {
    pattern: string;
    path?: string;
    limit?: number;
    signal?: AbortSignal;
  }) {
    const target = await resolvePath({
      filePath: input.path ?? '.',
      signal: input.signal,
    });
    const result = await run({
      command: `find ${shellQuote(target)} -type f -print0`,
      signal: input.signal,
    });
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout
      .split('\0')
      .filter(Boolean)
      .map(file => path.posix.relative(target, file))
      .filter(file => path.matchesGlob(file, input.pattern))
      .sort()
      .slice(0, input.limit ?? 1000);
  }

  async function ls(input: {
    path?: string;
    limit?: number;
    signal?: AbortSignal;
  }) {
    const target = await resolvePath({
      filePath: input.path ?? '.',
      signal: input.signal,
    });
    const result = await run({
      command: `find ${shellQuote(target)} -mindepth 1 -maxdepth 1 -printf '%f\\0'`,
      signal: input.signal,
    });
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout
      .split('\0')
      .filter(Boolean)
      .sort()
      .slice(0, input.limit ?? 500);
  }

  async function snapshot(): Promise<FxWorkspaceSnapshot> {
    const script = [
      'set -euo pipefail',
      `find . -type f -print0 -o -type l -print0 | while IFS= read -r -d '' fx_file; do`,
      `printf '%s' "\${fx_file#./}" | base64 -w0`,
      `printf '\t'`,
      'if [ -L "$fx_file" ]; then readlink -n -- "$fx_file" | sha256sum; else sha256sum < "$fx_file"; fi',
      'done',
    ].join('\n');
    const result = await run({ command: `bash -c ${shellQuote(script)}` });
    if (result.exitCode !== 0)
      throw new Error(
        `Unable to observe fx workspace changes: ${result.stderr}`,
      );
    const entries = result.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [encodedPath, hash] = line.split('\t');
        if (!encodedPath || !hash)
          throw new Error('Invalid sandbox workspace snapshot.');
        return [Buffer.from(encodedPath, 'base64').toString('utf8'), hash];
      });
    return Object.fromEntries(entries);
  }

  return { read, write, edit, bash, grep, glob, ls, snapshot };
}

export type FxRemoteOps = ReturnType<typeof createFxRemoteOps>;
