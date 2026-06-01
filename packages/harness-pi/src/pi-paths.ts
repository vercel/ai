import { realpathSync } from 'node:fs';
import path from 'node:path';

export interface PiPathMapper {
  /** The host-side mirror directory Pi reads/writes through the workspace VFS. */
  readonly hostWorkDir: string;
  /** The sandbox-side working directory where tools actually operate. */
  readonly sandboxWorkDir: string;
  /**
   * Translate a path the host sees (relative to `hostWorkDir`, or absolute
   * inside it, or already a sandbox path) to the canonical sandbox path. Throws
   * if the path would escape the workspace.
   */
  toSandboxPath(inputPath: string): string;
  /** Translate any path to its POSIX-relative form under `sandboxWorkDir`. */
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
  hostWorkDir: string,
  sandboxWorkDir: string,
): PiPathMapper {
  const normalizedHost = path.resolve(hostWorkDir);
  const normalizedSandbox = path.posix.normalize(sandboxWorkDir);
  const canonicalHost = canonicalizeForContainment(normalizedHost);

  return {
    hostWorkDir: normalizedHost,
    sandboxWorkDir: normalizedSandbox,
    toSandboxPath(inputPath: string) {
      if (path.posix.isAbsolute(inputPath)) {
        const normalizedInput = path.posix.normalize(inputPath);
        if (isInsidePosixPath(normalizedSandbox, normalizedInput)) {
          return normalizedInput;
        }
      }

      const resolvedHost = path.isAbsolute(inputPath)
        ? path.resolve(inputPath)
        : path.resolve(normalizedHost, inputPath);
      const canonicalResolvedHost = canonicalizeForContainment(resolvedHost);
      if (
        !isInsidePath(normalizedHost, resolvedHost) ||
        !isInsidePath(canonicalHost, canonicalResolvedHost)
      ) {
        throw new Error(`Pi path escapes the workspace: ${inputPath}`);
      }

      const relative = path
        .relative(normalizedHost, resolvedHost)
        .split(path.sep)
        .join('/');
      return relative
        ? path.posix.join(normalizedSandbox, relative)
        : normalizedSandbox;
    },
    toRelativePath(inputPath: string) {
      const sandboxPath = path.posix.isAbsolute(inputPath)
        ? path.posix.normalize(inputPath)
        : path.posix.join(
            normalizedSandbox,
            inputPath.split(path.sep).join('/'),
          );
      const relative = path.posix.relative(normalizedSandbox, sandboxPath);
      return relative || '.';
    },
  };
}
