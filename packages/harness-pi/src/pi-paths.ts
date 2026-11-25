import path from 'node:path';

export interface PiPathMapper {
  /** The sandbox-side working directory where tools actually operate. */
  readonly sandboxWorkDir: string;
  /** Additional sandbox roots accepted by read-only tools. */
  readonly readableSandboxRoots: ReadonlyArray<string>;
  /** Additional sandbox roots accepted by mutating tools. */
  readonly writableSandboxRoots: ReadonlyArray<string>;
  /** Sandbox roots rejected by every native file tool. */
  readonly deniedSandboxRoots: ReadonlyArray<string>;
  /**
   * Translate a tool path (relative to `sandboxWorkDir`, absolute, or
   * `~`-prefixed) to a normalized sandbox path. Throws if the path is inside a
   * denied root or outside the workspace and writable roots.
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
  readonly sandboxWorkDir: string;
  readonly readableRoots?: ReadonlyArray<PiReadablePathRoot>;
  readonly writableRoots?: ReadonlyArray<string>;
  readonly deniedRoots?: ReadonlyArray<string>;
  readonly homeDir?: string;
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

export function createPiPathMapper(
  options: CreatePiPathMapperOptions,
): PiPathMapper {
  const normalizedSandbox = path.posix.normalize(options.sandboxWorkDir);
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
  const absoluteSandboxPath = (inputPath: string): string =>
    path.posix.isAbsolute(inputPath)
      ? inputPath
      : path.posix.join(normalizedSandbox, inputPath);

  const writableAreas = [normalizedSandbox, ...writableRoots];
  const readableAreas = [...writableAreas, ...readableRoots];
  const assertAllowed = (
    sandboxPath: string,
    inputPath: string,
    allowedRoots: ReadonlyArray<string>,
    escapeMessage: string,
  ): string => {
    const normalizedPath = path.posix.normalize(sandboxPath);
    if (deniedRoots.some(root => isInsidePosixPath(root, normalizedPath))) {
      throw new Error(`Pi path is inside a denied root: ${inputPath}`);
    }
    if (!allowedRoots.some(root => isInsidePosixPath(root, normalizedPath))) {
      throw new Error(`Pi path ${escapeMessage}: ${inputPath}`);
    }
    return normalizedPath;
  };

  return {
    sandboxWorkDir: normalizedSandbox,
    readableSandboxRoots: readableRoots,
    writableSandboxRoots: writableRoots,
    deniedSandboxRoots: deniedRoots,
    toSandboxPath(inputPath: string) {
      return assertAllowed(
        absoluteSandboxPath(expandHome(inputPath)),
        inputPath,
        writableAreas,
        'escapes the workspace',
      );
    },
    toReadableSandboxPath(inputPath: string) {
      return assertAllowed(
        absoluteSandboxPath(expandHome(inputPath)),
        inputPath,
        readableAreas,
        'escapes the workspace',
      );
    },
    assertSandboxPath(inputPath: string) {
      return assertAllowed(
        inputPath,
        inputPath,
        writableAreas,
        'escapes the workspace',
      );
    },
    assertReadableSandboxPath(inputPath: string) {
      return assertAllowed(
        inputPath,
        inputPath,
        readableAreas,
        'escapes the readable roots',
      );
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
