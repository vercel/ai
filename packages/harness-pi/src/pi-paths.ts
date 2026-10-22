import { realpathSync } from 'node:fs';
import path from 'node:path';

export interface PiPathMapper {
  /** The host-side mirror directory Pi reads/writes through the workspace VFS. */
  readonly hostWorkDir: string;
  /** The sandbox-side working directory where tools actually operate. */
  readonly sandboxWorkDir: string;
  /** Additional sandbox roots accepted by read-only tools. */
  readonly readableSandboxRoots: ReadonlyArray<string>;
  /** Additional sandbox roots accepted by mutating tools. */
  readonly writableSandboxRoots: ReadonlyArray<string>;
  /** Sandbox roots rejected by every native file tool. */
  readonly deniedSandboxRoots: ReadonlyArray<string>;
  /**
   * Translate a path the host sees (relative to `hostWorkDir`, or absolute
   * inside it, or already a sandbox path) to the canonical sandbox path. Throws
   * if the path would escape the workspace and configured writable roots.
   */
  toSandboxPath(inputPath: string): string;
  /**
   * Translate a path for read-only tools. In addition to the workspace, this
   * allows explicitly configured sandbox roots such as `$HOME/.agents/skills`.
   */
  toReadableSandboxPath(inputPath: string): string;
  /** Verify that a sandbox-side path is writable under the configured policy. */
  assertSandboxPath(inputPath: string): string;
  /**
   * Verify that a sandbox-side path is inside `sandboxWorkDir` or an
   * explicitly configured readable root.
   */
  assertReadableSandboxPath(inputPath: string): string;
  /** Whether a sandbox-side path is inside `sandboxWorkDir`. */
  isWorkspacePath(inputPath: string): boolean;
  /** Denied roots nested within a sandbox-side path. */
  relativeDeniedRootsUnder(sandboxDir: string): string[];
  /** Translate any path to its POSIX-relative form under `sandboxWorkDir`. */
  toRelativePath(inputPath: string): string;
}

export interface PiReadablePathRoot {
  readonly sandboxDir: string;
}

/**
 * Additional sandbox paths exposed to Pi's native file tools. The session
 * workspace remains read-write and harness-provided skills remain read-only.
 * Writable roots are also readable, and denied roots take precedence over
 * every allowed root.
 *
 * This policy does not restrict Pi's `bash` tool. Shell filesystem access is
 * defined by the sandbox; the harness permission mode only controls approval.
 */
export interface PiFileToolPathPolicy {
  readonly readableRoots?: ReadonlyArray<string>;
  readonly writableRoots?: ReadonlyArray<string>;
  readonly deniedRoots?: ReadonlyArray<string>;
}

export interface CreatePiPathMapperOptions {
  readonly hostWorkDir: string;
  readonly sandboxWorkDir: string;
  readonly readableRoots?: ReadonlyArray<PiReadablePathRoot>;
  readonly writableRoots?: ReadonlyArray<string>;
  readonly deniedRoots?: ReadonlyArray<string>;
  readonly homeDir?: string;
}

function isInsidePath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function isInsidePosixPath(parent: string, candidate: string): boolean {
  const relative = path.posix.relative(parent, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith('../') &&
      !path.posix.isAbsolute(relative))
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
  options: CreatePiPathMapperOptions,
): PiPathMapper {
  const normalizedHost = path.resolve(options.hostWorkDir);
  const normalizedSandbox = path.posix.normalize(options.sandboxWorkDir);
  const canonicalHost = canonicalizeForContainment(normalizedHost);
  const normalizeRoots = ({
    roots,
    kind,
  }: {
    roots: ReadonlyArray<string> | undefined;
    kind: string;
  }): string[] =>
    (roots ?? []).map(root => {
      if (!path.posix.isAbsolute(root))
        throw new Error(
          `Pi ${kind} root must be an absolute sandbox path: ${root}`,
        );
      return path.posix.normalize(root);
    });
  const readableRoots = normalizeRoots({
    roots: options.readableRoots?.map(root => root.sandboxDir),
    kind: 'readable',
  });
  const writableRoots = normalizeRoots({
    roots: options.writableRoots,
    kind: 'writable',
  });
  const deniedRoots = normalizeRoots({
    roots: options.deniedRoots,
    kind: 'denied',
  });
  const expandHome = (inputPath: string): string =>
    options.homeDir != null && (inputPath === '~' || inputPath.startsWith('~/'))
      ? path.posix.join(options.homeDir, inputPath.slice(1))
      : inputPath;

  const isDeniedSandboxPath = (inputPath: string): boolean =>
    deniedRoots.some(root => isInsidePosixPath(root, inputPath));

  const assertNotDenied = (inputPath: string): void => {
    if (isDeniedSandboxPath(inputPath)) {
      throw new Error(`Pi path is inside a denied root: ${inputPath}`);
    }
  };

  const assertWritableSandboxPath = (inputPath: string): string => {
    const normalizedInput = path.posix.normalize(inputPath);
    assertNotDenied(normalizedInput);
    if (
      !isInsidePosixPath(normalizedSandbox, normalizedInput) &&
      !writableRoots.some(root => isInsidePosixPath(root, normalizedInput))
    ) {
      throw new Error(`Pi path escapes the workspace: ${inputPath}`);
    }
    return normalizedInput;
  };

  const assertReadableSandboxPath = (inputPath: string): string => {
    const normalizedInput = path.posix.normalize(inputPath);
    assertNotDenied(normalizedInput);
    if (
      !isInsidePosixPath(normalizedSandbox, normalizedInput) &&
      !readableRoots.some(root => isInsidePosixPath(root, normalizedInput)) &&
      !writableRoots.some(root => isInsidePosixPath(root, normalizedInput))
    ) {
      throw new Error(`Pi path escapes the readable roots: ${inputPath}`);
    }
    return normalizedInput;
  };

  const mapHostWorkspacePath = (inputPath: string): string | undefined => {
    const resolvedHost = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(normalizedHost, inputPath);
    const canonicalResolvedHost = canonicalizeForContainment(resolvedHost);
    if (!isInsidePath(normalizedHost, resolvedHost)) {
      return undefined;
    }
    if (!isInsidePath(canonicalHost, canonicalResolvedHost)) {
      throw new Error(`Pi path escapes the workspace: ${inputPath}`);
    }

    const relative = path
      .relative(normalizedHost, resolvedHost)
      .split(path.sep)
      .join('/');
    return relative
      ? path.posix.join(normalizedSandbox, relative)
      : normalizedSandbox;
  };

  const toWritableSandboxPath = (inputPath: string): string => {
    if (path.posix.isAbsolute(inputPath)) {
      const normalizedInput = path.posix.normalize(inputPath);
      if (isInsidePosixPath(normalizedSandbox, normalizedInput)) {
        return assertWritableSandboxPath(normalizedInput);
      }

      // Absolute host paths are handled below.
      const mappedHostPath = mapHostWorkspacePath(inputPath);
      if (mappedHostPath) {
        return assertWritableSandboxPath(mappedHostPath);
      }

      if (
        writableRoots.some(root => isInsidePosixPath(root, normalizedInput))
      ) {
        return assertWritableSandboxPath(normalizedInput);
      }
    } else {
      const mappedHostPath = mapHostWorkspacePath(inputPath);
      if (mappedHostPath) {
        return assertWritableSandboxPath(mappedHostPath);
      }
    }

    throw new Error(`Pi path escapes the workspace: ${inputPath}`);
  };

  return {
    hostWorkDir: normalizedHost,
    sandboxWorkDir: normalizedSandbox,
    readableSandboxRoots: readableRoots,
    writableSandboxRoots: writableRoots,
    deniedSandboxRoots: deniedRoots,
    toSandboxPath(inputPath: string) {
      return toWritableSandboxPath(expandHome(inputPath));
    },
    toReadableSandboxPath(inputPath: string) {
      inputPath = expandHome(inputPath);
      if (path.posix.isAbsolute(inputPath)) {
        const normalizedInput = path.posix.normalize(inputPath);
        if (isInsidePosixPath(normalizedSandbox, normalizedInput)) {
          return assertReadableSandboxPath(normalizedInput);
        }

        // Absolute host paths are handled by workspace mapping below.
        const mappedHostPath = mapHostWorkspacePath(inputPath);
        if (mappedHostPath) {
          return assertReadableSandboxPath(mappedHostPath);
        }

        if (
          readableRoots.some(root =>
            isInsidePosixPath(root, normalizedInput),
          ) ||
          writableRoots.some(root => isInsidePosixPath(root, normalizedInput))
        ) {
          return assertReadableSandboxPath(normalizedInput);
        }
      } else {
        const mappedHostPath = mapHostWorkspacePath(inputPath);
        if (mappedHostPath) {
          return assertReadableSandboxPath(mappedHostPath);
        }
      }
      throw new Error(`Pi path escapes the workspace: ${inputPath}`);
    },
    assertSandboxPath(inputPath: string) {
      return assertWritableSandboxPath(inputPath);
    },
    assertReadableSandboxPath(inputPath: string) {
      return assertReadableSandboxPath(inputPath);
    },
    isWorkspacePath(inputPath: string) {
      return isInsidePosixPath(
        normalizedSandbox,
        path.posix.normalize(inputPath),
      );
    },
    relativeDeniedRootsUnder(sandboxDir: string) {
      return deniedRoots
        .filter(root => isInsidePosixPath(sandboxDir, root))
        .map(root => path.posix.relative(sandboxDir, root));
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
