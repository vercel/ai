import { realpathSync } from 'node:fs';
import path from 'node:path';

export interface PiPathMapper {
  readonly localWorkDir: string;
  readonly remoteWorkDir: string;
  /**
   * Translate a path the host sees (relative to `localWorkDir`, or absolute
   * inside it, or already-remote) to the canonical remote path inside the
   * sandbox. Throws if the path would escape the workspace.
   */
  toRemotePath(inputPath: string): string;
  /** Translate any path to its POSIX-relative form under `remoteWorkDir`. */
  toRelativePath(inputPath: string): string;
}

function isInsidePath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function isInsidePosixPath(parent: string, candidate: string): boolean {
  const relative = path.posix.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.posix.isAbsolute(relative))
  );
}

function canonicalizeForContainment(inputPath: string): string {
  try {
    return realpathSync.native(inputPath);
  } catch {
    const parent = path.dirname(inputPath);
    if (parent === inputPath) {
      return inputPath;
    }
    return path.join(
      canonicalizeForContainment(parent),
      path.basename(inputPath),
    );
  }
}

export function createPiPathMapper(
  localWorkDir: string,
  remoteWorkDir: string,
): PiPathMapper {
  const normalizedLocal = path.resolve(localWorkDir);
  const normalizedRemote = path.posix.normalize(remoteWorkDir);
  const canonicalLocal = canonicalizeForContainment(normalizedLocal);

  return {
    localWorkDir: normalizedLocal,
    remoteWorkDir: normalizedRemote,
    toRemotePath(inputPath: string) {
      if (path.posix.isAbsolute(inputPath)) {
        const normalizedInput = path.posix.normalize(inputPath);
        if (isInsidePosixPath(normalizedRemote, normalizedInput)) {
          return normalizedInput;
        }
      }

      const resolvedLocal = path.isAbsolute(inputPath)
        ? path.resolve(inputPath)
        : path.resolve(normalizedLocal, inputPath);
      const canonicalResolvedLocal = canonicalizeForContainment(resolvedLocal);
      if (
        !isInsidePath(normalizedLocal, resolvedLocal) ||
        !isInsidePath(canonicalLocal, canonicalResolvedLocal)
      ) {
        throw new Error(`Pi path escapes the workspace: ${inputPath}`);
      }

      const relative = path
        .relative(normalizedLocal, resolvedLocal)
        .split(path.sep)
        .join('/');
      return relative
        ? path.posix.join(normalizedRemote, relative)
        : normalizedRemote;
    },
    toRelativePath(inputPath: string) {
      const remotePath = path.posix.isAbsolute(inputPath)
        ? path.posix.normalize(inputPath)
        : path.posix.join(
            normalizedRemote,
            inputPath.split(path.sep).join('/'),
          );
      const relative = path.posix.relative(normalizedRemote, remotePath);
      return relative || '.';
    },
  };
}
