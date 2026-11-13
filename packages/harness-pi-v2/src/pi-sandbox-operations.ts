import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type {
  EditOperations,
  FindOperations,
  LsOperations,
  ReadOperations,
  WriteOperations,
} from '@earendil-works/pi-coding-agent';
import path from 'node:path';

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
 * Lists the files below a directory in the sandbox that match a glob
 * pattern, as paths relative to the directory, sorted case-insensitively.
 *
 * A pattern without a `/` matches file names in any directory (`*.ts`
 * matches `src/a.ts`), while a pattern with a `/` matches the whole relative
 * path. Files matching one of the `ignore` patterns are skipped, and at most
 * `limit` paths are returned. A file path lists that file.
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
  const result = await session.run({
    command: `if [ -d ${quoted} ]; then find ${quoted} -type f; else printf '%s\\n' ${quoted}; fi`,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || `find failed with exit code ${result.exitCode}`,
    );
  }
  const matchesName = !pattern.includes('/');
  return result.stdout
    .split('\n')
    .filter(line => line.length > 0)
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

  const readBytes = async (filePath: string): Promise<Uint8Array> => {
    if (lastRead?.path === filePath) {
      const { bytes } = lastRead;
      lastRead = undefined;
      return bytes;
    }
    const bytes = await session.readBinaryFile({ path: filePath });
    if (bytes == null) {
      throw createNotFoundError({ operation: 'open', path: filePath });
    }
    return bytes;
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
      await statPath(filePath);
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
      const entries = await session.listDirectory({ path: directory });
      if (entries == null) {
        throw createNotFoundError({ operation: 'scandir', path: directory });
      }
      return entries.map(entry => entry.name);
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
