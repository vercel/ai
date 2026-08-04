import { spawn as spawnChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
// Captured at module load, never accessed as namespace properties.
//
// Host-runtime adapters patch `node:fs` at runtime: Pi installs a global VFS
// shim via `syncBuiltinESMExports` that redirects file operations into its own
// host mirror. Resolving through the namespace at call time would send writes
// into that mirror, where they vanish with the session. Destructuring binds the
// real implementations before any adapter loads.
import {
  mkdir as mkdirAsync,
  readFile as readFileAsync,
  realpath as realpathAsync,
  stat as statAsync,
  writeFile as writeFileAsync,
} from 'node:fs/promises';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { Readable } from 'node:stream';
import {
  extractLines,
  type Experimental_SandboxProcess as SandboxProcess,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';

const nodeFs = {
  mkdir: mkdirAsync,
  readFile: readFileAsync,
  realpath: realpathAsync,
  stat: statAsync,
  writeFile: writeFileAsync,
};

/**
 * Everything a session needs to operate. Constructed by the provider and
 * shared by reference between a {@link LocalWorkspaceNetworkSandboxSession} and
 * the reduced session its `restricted()` returns, so both observe the same
 * child-process set.
 */
export type LocalWorkspaceSessionContext = {
  /** Sandbox root, which is the project directory. Already realpath'd. */
  readonly workingDirectory: string;
  /** Inherited process environment plus the caller's overlay. */
  readonly env: Record<string, string>;
  /** Live children, so `stop()` can reap the whole tree. */
  readonly children: Set<ReturnType<typeof spawnChildProcess>>;
};

/**
 * Child sets belonging to sessions that have not been stopped.
 *
 * Shared so one exit handler covers every session. One handler per session
 * tripped Node's `MaxListenersExceededWarning` at eleven concurrent sessions,
 * and detach never calls `stop()`, so they accumulated for the life of the
 * process.
 */
const unstoppedChildSets = new Set<Set<ReturnType<typeof spawnChildProcess>>>();
let exitReaperInstalled = false;

/**
 * Reap this session's processes if the host exits without stopping it.
 *
 * Leaving processes behind is never a supported mode, so this fires even for
 * sessions that were detached rather than stopped.
 */
export function reapChildSetOnExit(
  children: Set<ReturnType<typeof spawnChildProcess>>,
): void {
  unstoppedChildSets.add(children);
  if (exitReaperInstalled) return;
  exitReaperInstalled = true;
  process.once('exit', () => {
    for (const childSet of unstoppedChildSets) {
      for (const child of childSet) killProcessTree(child);
    }
  });
}

/** Stop reaping a session's processes, once it has cleaned up after itself. */
export function stopReapingChildSet(
  children: Set<ReturnType<typeof spawnChildProcess>>,
): void {
  unstoppedChildSets.delete(children);
}

/**
 * Kill a process and everything it spawned.
 *
 * Bridge-backed adapters spawn a bridge that spawns a CLI that spawns more
 * processes, so killing the direct child is not enough: an aborted
 * orchestrator was observed leaving a bridge alive for twelve minutes.
 * Children are spawned `detached`, which puts each one in its own process
 * group, so a negative pid signals the entire group.
 */
export function killProcessTree(
  child: ReturnType<typeof spawnChildProcess>,
): void {
  if (child.pid == null) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // The group is already gone, or the platform refused a group signal.
    // Fall back to the direct child; failing that, it has already exited.
    try {
      child.kill('SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

/**
 * `Experimental_SandboxSession` implementation backed by the local machine:
 * real files, real processes, the user's own environment.
 *
 * This is the tool-safe surface returned by
 * `LocalWorkspaceNetworkSandboxSession.restricted()`, not constructed directly
 * by consumers.
 *
 * It applies **no path containment**. A guard here would constrain nothing:
 * bridge-backed harnesses never route their built-in tools through this API,
 * and every harness ships a shell tool. See the package README.
 */
export class LocalWorkspaceSandboxSession implements SandboxSession {
  constructor(protected readonly context: LocalWorkspaceSessionContext) {}

  /**
   * Consumers put this in the model's instructions, so it has to say where
   * relative paths actually land.
   */
  get description(): string {
    return [
      `Local machine project directory: ${this.context.workingDirectory}.`,
      'Relative paths and commands resolve against that directory.',
      'Commands run as a normal OS process on the host, as the current user.',
    ].join('\n');
  }

  private resolveAgainstWorkingDirectory(path: string): string {
    return isAbsolute(path)
      ? path
      : resolvePath(this.context.workingDirectory, path);
  }

  /**
   * Stat rather than read to decide whether the file exists.
   *
   * This is the streaming primitive, so it must not buffer. Reading the bytes
   * first just to return `null` for a missing file pulled the whole file into
   * memory, twice, before the consumer saw a single chunk.
   */
  readFile = async ({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<ReadableStream<Uint8Array> | null> => {
    abortSignal?.throwIfAborted();
    const absolutePath = this.resolveAgainstWorkingDirectory(path);
    try {
      if (!(await nodeFs.stat(absolutePath)).isFile()) return null;
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    }
    return Readable.toWeb(
      createReadStream(absolutePath),
    ) as ReadableStream<Uint8Array>;
  };

  readBinaryFile = async ({
    path,
    abortSignal,
  }: {
    path: string;
    abortSignal?: AbortSignal;
  }): Promise<Uint8Array | null> => {
    abortSignal?.throwIfAborted();
    try {
      const buffer = await nodeFs.readFile(
        this.resolveAgainstWorkingDirectory(path),
      );
      return new Uint8Array(buffer);
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    }
  };

  readTextFile = async ({
    path,
    encoding = 'utf-8',
    startLine,
    endLine,
    abortSignal,
  }: {
    path: string;
    encoding?: string;
    startLine?: number;
    endLine?: number;
    abortSignal?: AbortSignal;
  }): Promise<string | null> => {
    const bytes = await this.readBinaryFile({ path, abortSignal });
    if (bytes == null) return null;
    const text = new TextDecoder(encoding).decode(bytes);
    return extractLines({ text, startLine, endLine });
  };

  writeFile = async ({
    path,
    content,
    abortSignal,
  }: {
    path: string;
    content: ReadableStream<Uint8Array>;
    abortSignal?: AbortSignal;
  }): Promise<void> => {
    abortSignal?.throwIfAborted();
    const chunks: Uint8Array[] = [];
    for await (const chunk of content as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    await this.writeBinaryFile({
      path,
      content: Buffer.concat(chunks),
      abortSignal,
    });
  };

  writeBinaryFile = async ({
    path,
    content,
    abortSignal,
  }: {
    path: string;
    content: Uint8Array;
    abortSignal?: AbortSignal;
  }): Promise<void> => {
    abortSignal?.throwIfAborted();
    const absolutePath = this.resolveAgainstWorkingDirectory(path);
    await nodeFs.mkdir(dirname(absolutePath), { recursive: true });
    await nodeFs.writeFile(absolutePath, content);
  };

  writeTextFile = async ({
    path,
    content,
    encoding = 'utf-8',
    abortSignal,
  }: {
    path: string;
    content: string;
    encoding?: string;
    abortSignal?: AbortSignal;
  }): Promise<void> => {
    await this.writeBinaryFile({
      path,
      content: Buffer.from(content, encoding as BufferEncoding),
      abortSignal,
    });
  };

  spawn = async ({
    command,
    workingDirectory,
    env,
    abortSignal,
  }: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<SandboxProcess> => {
    abortSignal?.throwIfAborted();

    const child = spawnChildProcess('bash', ['-c', command], {
      cwd:
        workingDirectory != null
          ? this.resolveAgainstWorkingDirectory(workingDirectory)
          : this.context.workingDirectory,
      env: { ...this.context.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own process group, so `killProcessTree` can reap the whole tree.
      detached: true,
    });

    this.context.children.add(child);

    const onAbort = () => killProcessTree(child);
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    const exited = new Promise<{ exitCode: number }>(resolveExit => {
      const settle = (exitCode: number) => {
        this.context.children.delete(child);
        abortSignal?.removeEventListener('abort', onAbort);
        resolveExit({ exitCode });
      };
      child.on('exit', code => settle(code ?? -1));
      child.on('error', () => settle(-1));
    });

    return {
      ...(child.pid != null ? { pid: child.pid } : {}),
      stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(child.stderr) as ReadableStream<Uint8Array>,
      wait: () => exited,
      kill: async () => {
        killProcessTree(child);
        await exited;
      },
    };
  };

  run = async (options: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
    const child = await this.spawn(options);
    const [stdout, stderr, { exitCode }] = await Promise.all([
      collectStream(child.stdout),
      collectStream(child.stderr),
      child.wait(),
    ]);
    return { exitCode, stdout, stderr };
  };
}

async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'EISDIR';
}

/**
 * `realpath` a path that may not exist yet, by resolving the deepest existing
 * ancestor and re-appending the missing segments.
 *
 * Needed because every path comparison in this package must be symlink-stable:
 * on macOS `/tmp` is a symlink to `/private/tmp`, and a project may itself be
 * reached through a symlink. Comparing one realpath'd path against one raw path
 * silently fails.
 */
export async function realpathAllowingMissing(path: string): Promise<string> {
  try {
    return await nodeFs.realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;
    const resolvedParent = await realpathAllowingMissing(parent);
    return resolvePath(resolvedParent, path.slice(parent.length + 1));
  }
}
