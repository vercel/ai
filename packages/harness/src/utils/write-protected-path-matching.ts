import path from 'node:path';

/*
 * Upper bound on the entries scanned inside write-protected directories per
 * check. Exceeding it makes the check report the write as protected, so a
 * large protected directory costs a host approval instead of an unbounded
 * filesystem walk.
 */
export const WRITE_PROTECTION_SCAN_LIMIT = 2000;

export function assertWriteProtectedPathEntries(
  entries: ReadonlyArray<string>,
): void {
  for (const entry of entries) {
    if (
      typeof entry !== 'string' ||
      entry.length === 0 ||
      path.posix.isAbsolute(entry) ||
      entry
        .split('/')
        .some(segment => segment === '' || segment === '.' || segment === '..')
    ) {
      throw new TypeError(
        `Write-protected path entries must be relative paths without empty, "." or ".." segments; received ${JSON.stringify(entry)}.`,
      );
    }
  }
}

export function isInsideWriteProtectionPath({
  parent,
  candidate,
}: {
  parent: string;
  candidate: string;
}): boolean {
  const relative = path.posix.relative(parent, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith('../') &&
      !path.posix.isAbsolute(relative))
  );
}

/*
 * A target matches when it is a protected path, lies inside one, or is a
 * parent of one, since moving or deleting a parent replaces the protected
 * contents. Hard links are invisible to path resolution, so while any
 * protected path exists, files with more than one link match as well.
 */
export function matchesWriteProtectedPath({
  targets,
  protectedPaths,
  anyProtectedPathExists,
}: {
  targets: ReadonlyArray<{ path: string; isMultiLinkFile: boolean }>;
  protectedPaths: ReadonlyArray<string>;
  anyProtectedPathExists: boolean;
}): boolean {
  return targets.some(
    target =>
      protectedPaths.some(
        protectedPath =>
          isInsideWriteProtectionPath({
            parent: protectedPath,
            candidate: target.path,
          }) ||
          isInsideWriteProtectionPath({
            parent: target.path,
            candidate: protectedPath,
          }),
      ) ||
      (anyProtectedPathExists && target.isMultiLinkFile),
  );
}
