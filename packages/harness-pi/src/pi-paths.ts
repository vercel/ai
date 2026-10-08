import path from 'node:path';

export interface PiPathMapper {
  /** The sandbox-side working directory where tools actually operate. */
  readonly sandboxWorkDir: string;
  /**
   * Translate a tool path (relative to `sandboxWorkDir`, or an absolute
   * sandbox path inside it) to the canonical sandbox path. Throws if the path
   * would escape the workspace.
   */
  toSandboxPath(inputPath: string): string;
  /**
   * Translate a path for read-only tools. In addition to the workspace, this
   * allows explicitly configured sandbox roots such as `$HOME/.agents/skills`.
   */
  toReadableSandboxPath(inputPath: string): string;
  /** Verify that a sandbox-side path is still inside `sandboxWorkDir`. */
  assertSandboxPath(inputPath: string): string;
  /**
   * Verify that a sandbox-side path is inside `sandboxWorkDir` or an
   * explicitly configured readable root.
   */
  assertReadableSandboxPath(inputPath: string): string;
  /** Translate any path to its POSIX-relative form under `sandboxWorkDir`. */
  toRelativePath(inputPath: string): string;
  relativeDeniedRootsUnder(sandboxDir: string): string[];
}

export interface PiReadablePathRoot {
  readonly sandboxDir: string;
}

export interface CreatePiPathMapperOptions {
  readonly sandboxWorkDir: string;
  readonly readableRoots?: ReadonlyArray<PiReadablePathRoot>;
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
  const readableRoots =
    options.readableRoots?.map(root => ({
      sandboxDir: path.posix.normalize(root.sandboxDir),
    })) ?? [];
  const deniedRoots =
    options.deniedRoots?.map(root => path.posix.normalize(root)) ?? [];

  const assertNotDenied = (sandboxPath: string, inputPath: string): string => {
    if (deniedRoots.some(root => isInsidePosixPath(root, sandboxPath))) {
      throw new Error(`Pi path is inside a denied root: ${inputPath}`);
    }
    return sandboxPath;
  };

  const expandHome = (inputPath: string): string =>
    options.homeDir != null && (inputPath === '~' || inputPath.startsWith('~/'))
      ? path.posix.join(options.homeDir, inputPath.slice(1))
      : inputPath;

  const assertWorkspaceSandboxPath = (
    sandboxPath: string,
    inputPath: string,
  ): string => {
    const normalizedInput = path.posix.normalize(sandboxPath);
    if (!isInsidePosixPath(normalizedSandbox, normalizedInput)) {
      throw new Error(`Pi path escapes the workspace: ${inputPath}`);
    }
    return normalizedInput;
  };

  const assertReadableSandboxPath = (
    sandboxPath: string,
    inputPath: string,
  ): string => {
    const normalizedInput = path.posix.normalize(sandboxPath);
    if (
      !isInsidePosixPath(normalizedSandbox, normalizedInput) &&
      !readableRoots.some(root =>
        isInsidePosixPath(root.sandboxDir, normalizedInput),
      )
    ) {
      throw new Error(`Pi path escapes the readable roots: ${inputPath}`);
    }
    return normalizedInput;
  };

  const absoluteSandboxPath = (inputPath: string): string =>
    path.posix.isAbsolute(inputPath)
      ? inputPath
      : path.posix.join(normalizedSandbox, inputPath);

  return {
    sandboxWorkDir: normalizedSandbox,
    toSandboxPath(inputPath: string) {
      return assertNotDenied(
        assertWorkspaceSandboxPath(
          absoluteSandboxPath(expandHome(inputPath)),
          inputPath,
        ),
        inputPath,
      );
    },
    toReadableSandboxPath(inputPath: string) {
      const sandboxPath = path.posix.normalize(
        absoluteSandboxPath(expandHome(inputPath)),
      );
      return assertNotDenied(
        readableRoots.some(root =>
          isInsidePosixPath(root.sandboxDir, sandboxPath),
        )
          ? sandboxPath
          : assertWorkspaceSandboxPath(sandboxPath, inputPath),
        inputPath,
      );
    },
    assertSandboxPath(inputPath: string) {
      return assertNotDenied(
        assertWorkspaceSandboxPath(inputPath, inputPath),
        inputPath,
      );
    },
    assertReadableSandboxPath(inputPath: string) {
      return assertNotDenied(
        assertReadableSandboxPath(inputPath, inputPath),
        inputPath,
      );
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
    relativeDeniedRootsUnder(sandboxDir: string) {
      return deniedRoots
        .filter(root => isInsidePosixPath(sandboxDir, root))
        .map(root => path.posix.relative(sandboxDir, root));
    },
  };
}
