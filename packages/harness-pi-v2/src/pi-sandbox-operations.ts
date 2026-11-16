import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import {
  formatSize,
  type EditOperations,
  type FindOperations,
  type LsOperations,
  type ReadOperations,
  type WriteOperations,
} from '@earendil-works/pi-coding-agent';
import path from 'node:path';

/**
 * Bytes of a file that the host reads into memory at once. Pi's read tool
 * shows at most `DEFAULT_MAX_BYTES` of a file but reads the whole file, which
 * only fits in the memory of the process that runs the tool; the host that
 * runs the sandbox serves many sessions, so it refuses to read a file above
 * this limit instead.
 */
const MAX_READ_BYTES = 10 * 1024 * 1024;

/**
 * Bytes that one read command brings back, before base64 encoding. A chunk
 * keeps a single command's output small enough for a sandbox that limits it
 * (just-bash refuses more than 10 MiB of output), so a file up to the read
 * limit is read by a few commands that are never cut off.
 */
const READ_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Characters of the base64 text that one read command prints for a chunk, as a
 * multiple of four so that every window decodes on its own.
 */
const READ_CHUNK_CHARS = Math.ceil(READ_CHUNK_BYTES / 3) * 4;

/**
 * Outcome of a bounded read: the bytes and whether the file ended within the
 * limit, a sandbox that could not run the read, or a file that changed while it
 * was read.
 */
interface BoundedRead {
  /**
   * What the read did.
   */
  status: 'read' | 'refused' | 'changed';

  /**
   * Bytes the host kept, for a read that succeeded.
   */
  bytes?: Uint8Array;

  /**
   * Whether the file ended within the limit, for a read that succeeded.
   */
  complete?: boolean;
}

/**
 * Reads at most `limitBytes` of a file with commands inside the sandbox, so the
 * host never holds more than the limit, whatever a stat reported: a file that
 * grows or is replaced between its stat and its read cannot exhaust the process
 * that serves many sessions.
 *
 * Each command prints one window of the file's base64 text, so that a chunk
 * both survives the text stream of a sandbox and stays far below its
 * command-output limit. A window that is shorter than the text it asked for
 * means the file changed, since the length of its text was read first.
 */
async function readFileBytes(options: {
  /**
   * Sandbox session the file is in.
   */
  session: SandboxSession;

  /**
   * Absolute path of the file.
   */
  filePath: string;

  /**
   * Maximum number of bytes to hold.
   */
  limitBytes: number;
}): Promise<BoundedRead> {
  const { session, filePath, limitBytes } = options;
  const quoted = shellQuote(filePath);
  /*
   * The length of the encoded text gives every window its exact size, so the
   * last window is not shifted back when the file is shorter than a full one.
   * `pipefail` reports a file that the sandbox cannot read, which `wc` alone
   * would hide behind its own exit status.
   */
  const sized = await session.run({
    command: `set -o pipefail; base64 ${quoted} | tr -d '\\n' | wc -c`,
  });
  if (sized.exitCode !== 0) return { status: 'refused' };
  const encodedLength = Number(sized.stdout.trim());
  if (!Number.isSafeInteger(encodedLength) || encodedLength < 0) {
    return { status: 'refused' };
  }
  if (encodedLength === 0) {
    return { status: 'read', bytes: new Uint8Array(), complete: true };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const finish = (complete: boolean): BoundedRead => {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status: 'read', bytes, complete };
  };
  for (
    let start = 0;
    start < encodedLength && total <= limitBytes;
    start += READ_CHUNK_CHARS
  ) {
    const size = Math.min(READ_CHUNK_CHARS, encodedLength - start);
    const result = await session.run({
      command: `set -o pipefail; base64 ${quoted} | tr -d '\\n' | head -c ${start + size} | tail -c ${size}`,
    });
    // 141 is `head` closing the pipe; anything else is a failed read.
    if (result.exitCode !== 0 && result.exitCode !== 141) {
      return { status: 'refused' };
    }
    const encoded = result.stdout.replace(/\s+/g, '');
    /*
     * A window that is not the text it asked for means the file shrank or was
     * replaced after its length was read, so the content cannot be assembled.
     */
    if (encoded.length !== size) return { status: 'changed' };
    const chunk = Buffer.from(encoded, 'base64');
    if (chunk.byteLength === 0) return { status: 'changed' };
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  return finish(total <= limitBytes);
}

/**
 * File system operations of Pi's built-in tools, implemented on a sandbox
 * session instead of the local file system.
 */
export type PiSandboxOperations = ReadOperations &
  WriteOperations &
  EditOperations &
  FindOperations &
  LsOperations;

/**
 * Returns the MIME type of an image from its leading bytes, for the image
 * formats Pi's read tool can send to a model.
 */
export function detectImageMimeType(options: {
  /**
   * Leading bytes of the file.
   */
  bytes: Uint8Array;
}): string | undefined {
  const { bytes } = options;
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png';
  }
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (startsWith(0x42, 0x4d)) return 'image/bmp';
  return undefined;
}

/**
 * Creates the error thrown for a path that does not exist, worded like
 * Node.js file system errors so Pi's tools report it the same way.
 */
function createNotFoundError(options: {
  /**
   * Operation that failed, e.g. `open`.
   */
  operation: string;

  /**
   * Path that does not exist.
   */
  path: string;
}): Error {
  return Object.assign(
    new Error(
      `ENOENT: no such file or directory, ${options.operation} '${options.path}'`,
    ),
    { code: 'ENOENT' },
  );
}

/**
 * Paths that one recursive search may enumerate, so a tree with a huge number
 * of files cannot take more than this many paths from the sandbox.
 */
const MAX_FIND_ENTRIES = 50_000;

/**
 * Bytes of the enumeration that the host keeps, so a tree with very long paths
 * cannot fill the memory of the process that serves many sessions. The limit
 * applies before Pi sees the paths and before they are filtered or sorted.
 */
const MAX_FIND_BYTES = 4 * 1024 * 1024;

/**
 * Lists the files below a directory in the sandbox that match a glob
 * pattern, as paths relative to the directory, sorted case-insensitively.
 *
 * A pattern without a `/` matches file names in any directory (`*.ts`
 * matches `src/a.ts`), while a pattern with a `/` matches the whole relative
 * path. Files matching one of the `ignore` patterns are skipped, and at most
 * `limit` paths are returned. A file path lists that file.
 *
 * The sandbox stops the enumeration at `MAX_FIND_ENTRIES` paths and
 * `MAX_FIND_BYTES` bytes, so a tree that a sandbox user filled cannot exhaust
 * the host before the requested limit applies.
 */
export async function findSandboxFiles(options: {
  /**
   * Sandbox session to search.
   */
  session: SandboxSession;

  /**
   * Glob pattern to match.
   */
  pattern: string;

  /**
   * Absolute directory to search.
   */
  directory: string;

  /**
   * Glob patterns of relative paths to skip.
   */
  ignore: readonly string[];

  /**
   * Maximum number of paths to return.
   */
  limit: number;
}): Promise<string[]> {
  const { session, pattern, directory, ignore, limit } = options;
  const quoted = shellQuote(directory);
  /*
   * Directories that the ignore patterns exclude are pruned in the sandbox, so
   * a large `node_modules` or `.git` cannot use up the budget that the paths a
   * search may return share.
   */
  const pruned = [
    ...new Set(
      ignore
        .map(ignored => /^\*\*\/([^/*]+)\/\*\*$/.exec(ignored)?.[1])
        .filter((name): name is string => name != null),
    ),
  ];
  const prune =
    pruned.length === 0
      ? ''
      : `\\( ${pruned
          .map(name => `-name ${shellQuote(name)}`)
          .join(' -o ')} \\) -prune -o`;
  const result = await session.run({
    command: `set -o pipefail; if [ -d ${quoted} ]; then find ${quoted} ${prune} -type f -print | head -n ${MAX_FIND_ENTRIES + 1} | head -c ${MAX_FIND_BYTES + 1}; else printf '%s\\n' ${quoted}; fi`,
  });
  let entries = result.stdout.split('\n').filter(line => line.length > 0);
  const reachedBudget =
    entries.length > MAX_FIND_ENTRIES ||
    Buffer.byteLength(result.stdout, 'utf-8') > MAX_FIND_BYTES;
  /*
   * A sandbox whose command runner ignores SIGPIPE reports the closed pipe as a
   * write error, so a result that reached the budget is accepted whatever its
   * exit code; 141 is `head` closing the pipe.
   */
  if (!reachedBudget && result.exitCode !== 0 && result.exitCode !== 141) {
    throw new Error(
      result.stderr.trim() || `find failed with exit code ${result.exitCode}`,
    );
  }
  if (reachedBudget) {
    // The byte budget can cut the last path in half, so it is dropped.
    if (!result.stdout.endsWith('\n')) entries = entries.slice(0, -1);
    entries = entries.slice(0, MAX_FIND_ENTRIES);
  }
  const matchesName = !pattern.includes('/');
  const results = entries
    .map(filePath =>
      filePath === directory
        ? path.posix.basename(filePath)
        : path.posix.relative(
            directory,
            path.posix.resolve(directory, filePath),
          ),
    )
    .filter(relativePath => relativePath.length > 0)
    .filter(
      relativePath =>
        !ignore.some(ignored => path.posix.matchesGlob(relativePath, ignored)),
    )
    .filter(relativePath =>
      path.posix.matchesGlob(
        matchesName ? path.posix.basename(relativePath) : relativePath,
        pattern,
      ),
    )
    .sort((left, right) =>
      left.toLowerCase().localeCompare(right.toLowerCase()),
    )
    .slice(0, limit);
  /*
   * Pi reports its own result limit when the search returns `limit` paths, but
   * it cannot report that the enumeration stopped before it found them, so an
   * incomplete answer is an error rather than a short list.
   */
  if (reachedBudget && results.length < limit) {
    throw new Error(
      `The search stopped after ${MAX_FIND_ENTRIES} files before it found ${limit} matches. Search a subdirectory or narrow the pattern.`,
    );
  }
  return results;
}

/**
 * Entries of a directory that one listing may transfer, so a directory that
 * sandbox code filled cannot take more than this many names from the sandbox.
 */
const MAX_LIST_ENTRIES = 10_000;

/**
 * Bytes of a directory listing that the host keeps, so names of extreme length
 * cannot fill the memory of the process that serves many sessions.
 */
const MAX_LIST_BYTES = 2 * 1024 * 1024;

/**
 * Lists the entries of a directory in the sandbox.
 *
 * The sandbox sorts the entries and stops the listing at `MAX_LIST_ENTRIES`
 * names and `MAX_LIST_BYTES` bytes, so a directory that sandbox code filled is
 * never transferred as a whole; the cap cuts the entries that Pi's own order
 * puts last. Pi adds the directory suffix and its entry-limit notice.
 */
export async function listSandboxDirectory(options: {
  /**
   * Sandbox session to list.
   */
  session: SandboxSession;

  /**
   * Absolute directory to list.
   */
  directory: string;
}): Promise<string[]> {
  const { session, directory } = options;
  const result = await session.run({
    command: `set -o pipefail; ls -A ${shellQuote(directory)} | sort | head -n ${MAX_LIST_ENTRIES + 1} | head -c ${MAX_LIST_BYTES + 1}`,
  });
  let entries = result.stdout.split('\n').filter(line => line.length > 0);
  const reachedBudget =
    entries.length > MAX_LIST_ENTRIES ||
    Buffer.byteLength(result.stdout, 'utf-8') > MAX_LIST_BYTES;
  /*
   * A sandbox whose command runner ignores SIGPIPE reports the closed pipe as a
   * write error, so a listing that reached the budget is accepted whatever its
   * exit code; 141 is `head` closing the pipe.
   */
  if (!reachedBudget && result.exitCode !== 0 && result.exitCode !== 141) {
    throw createNotFoundError({ operation: 'scandir', path: directory });
  }
  if (reachedBudget) {
    // The byte budget can cut the last name in half, so it is dropped.
    if (!result.stdout.endsWith('\n')) entries = entries.slice(0, -1);
    entries = entries.slice(0, MAX_LIST_ENTRIES);
  }
  return entries;
}

/**
 * Creates the operations of Pi's read, write, edit, find and ls tools on a
 * sandbox session. Pi's tools pass absolute paths resolved against the
 * sandbox working directory.
 *
 * The read tool detects an image before reading it, so the bytes read for
 * the detection are kept for the following read of the same path.
 */
export function createPiSandboxOperations(options: {
  /**
   * Sandbox session the operations act on.
   */
  session: SandboxSession;
}): PiSandboxOperations {
  const { session } = options;
  let lastRead: { path: string; bytes: Uint8Array } | undefined;
  let lastStat:
    | { path: string; type: 'file' | 'directory' | 'other'; size: number }
    | undefined;

  /**
   * Returns the type and size of a file, reusing the stat that `access()` read
   * for the same path right before, as Pi's read tool calls `access()` before
   * it reads.
   */
  const statFor = async (
    filePath: string,
  ): Promise<
    { type: 'file' | 'directory' | 'other'; size: number } | undefined
  > => {
    if (lastStat?.path === filePath) {
      const { type, size } = lastStat;
      lastStat = undefined;
      return { type, size };
    }
    const stat = await session.stat({ path: filePath });
    return stat == null ? undefined : { type: stat.type, size: stat.size };
  };

  const readBytes = async (filePath: string): Promise<Uint8Array> => {
    if (lastRead?.path === filePath) {
      const { bytes } = lastRead;
      lastRead = undefined;
      return bytes;
    }
    const stat = await statFor(filePath);
    if (stat?.type === 'directory') {
      throw Object.assign(
        new Error(
          `EISDIR: illegal operation on a directory, read '${filePath}'`,
        ),
        { code: 'EISDIR' },
      );
    }
    if (stat != null && stat.type !== 'file') {
      // A device or a pipe has no size to check and may never end.
      throw new Error(
        `Cannot read ${filePath}: it is not a regular file. Read it with a bash command instead.`,
      );
    }
    if (stat != null && stat.size > MAX_READ_BYTES) {
      throw new Error(
        `File is too large to read: ${filePath} is ${formatSize(stat.size)}, the limit is ${formatSize(MAX_READ_BYTES)}. Read part of it with a bash command, for example \`sed -n '1,200p' ${filePath}\`.`,
      );
    }
    /*
     * The read itself is bounded, so the size the stat reported is only a hint:
     * a file that grows or is replaced between the stat and the read still
     * cannot make the host hold more than the limit.
     */
    const read = await readFileBytes({
      session,
      filePath,
      limitBytes: MAX_READ_BYTES,
    });
    if (read.status === 'refused') {
      if ((await session.stat({ path: filePath })) == null) {
        throw createNotFoundError({ operation: 'open', path: filePath });
      }
      throw new Error(
        `Cannot read ${filePath}: the sandbox could not run the bounded read. Read it with a bash command instead, for example \`sed -n '1,200p' ${filePath}\`.`,
      );
    }
    if (read.status === 'changed') {
      throw new Error(
        `Cannot read ${filePath}: the file changed while it was read. Try again.`,
      );
    }
    if (!read.complete) {
      throw new Error(
        `File is too large to read: ${filePath} is larger than the limit of ${formatSize(MAX_READ_BYTES)}. Read part of it with a bash command, for example \`sed -n '1,200p' ${filePath}\`.`,
      );
    }
    return read.bytes ?? new Uint8Array();
  };

  const statPath = async (filePath: string) => {
    const stat = await session.stat({ path: filePath });
    if (stat == null) {
      throw createNotFoundError({ operation: 'stat', path: filePath });
    }
    return stat;
  };

  return {
    async readFile(filePath) {
      return Buffer.from(await readBytes(filePath));
    },
    async access(filePath) {
      /*
       * Pi's read and edit tools call `access()` right before they read, so the
       * size can be reused there without a second request. Tools that stat many
       * paths, such as `ls`, must not leave a size behind that a later read
       * trusts after the file has grown.
       */
      const stat = await statPath(filePath);
      lastStat = { path: filePath, type: stat.type, size: stat.size };
    },
    async detectImageMimeType(filePath) {
      const bytes = await readBytes(filePath);
      lastRead = { path: filePath, bytes };
      return detectImageMimeType({ bytes });
    },
    // oxlint-disable-next-line ai-sdk/require-object-parameter -- Pi `WriteOperations` signature.
    async writeFile(filePath, content) {
      await session.writeTextFile({ path: filePath, content });
    },
    async mkdir(directory) {
      const result = await session.run({
        command: `mkdir -p ${shellQuote(directory)}`,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          result.stderr.trim() ||
            `mkdir failed with exit code ${result.exitCode}`,
        );
      }
    },
    async exists(filePath) {
      return (await session.stat({ path: filePath })) != null;
    },
    async stat(filePath) {
      const stat = await statPath(filePath);
      return { isDirectory: () => stat.type === 'directory' };
    },
    async readdir(directory) {
      return listSandboxDirectory({ session, directory });
    },
    // oxlint-disable-next-line ai-sdk/require-object-parameter -- Pi `FindOperations` signature.
    async glob(pattern, directory, globOptions) {
      return findSandboxFiles({
        session,
        pattern,
        directory,
        ignore: globOptions.ignore,
        limit: globOptions.limit,
      });
    },
  };
}

/**
 * Replaces a leading `~` of a path with the sandbox user's home directory.
 * Pi's tools would otherwise expand it to the home directory of the process
 * running the adapter.
 */
export function expandSandboxHome(options: {
  /**
   * Path given by the model.
   */
  path: string;

  /**
   * Home directory of the sandbox user.
   */
  home: string;
}): string {
  const { path: inputPath, home } = options;
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/')) return `${home}${inputPath.slice(1)}`;
  return inputPath;
}
