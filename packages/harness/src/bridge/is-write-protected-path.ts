import type { Stats } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  WRITE_PROTECTION_SCAN_LIMIT,
  assertWriteProtectedPathEntries,
  isInsideWriteProtectionPath,
  matchesWriteProtectedPath,
} from '../utils/write-protected-path-matching';

/**
 * Returns whether writing to any of `paths` touches a write-protected path and
 * therefore requires the host's approval. Runs inside the sandbox, next to the
 * files it checks.
 *
 * `writeProtectedPaths` entries are relative to `workDir` and must not contain
 * empty, `.`, or `..` segments. Relative `paths` resolve against `cwd`, which
 * defaults to `workDir`.
 *
 * A path matches when its canonical location is a protected path, lies inside
 * one, or is a parent of one. Each protected entry is protected both at its
 * literal location below the canonical working directory and at its canonical
 * location. The literal location covers parents of a protected path that is
 * itself a symlink, whose canonical location lies elsewhere.
 *
 * Protected paths are resolved on every call because the filesystem can change
 * during a session. Symlinks inside protected directories protect their
 * targets as well, so files reachable through a protected path cannot be
 * written through an unprotected alias. While any protected path exists,
 * writes to files with more than one link match too. Any resolution failure,
 * including dangling or looping symlinks, reports the write as protected.
 */
export async function isWriteProtectedPath({
  workDir,
  cwd = workDir,
  paths,
  writeProtectedPaths,
}: {
  workDir: string;
  cwd?: string;
  paths: ReadonlyArray<string>;
  writeProtectedPaths: ReadonlyArray<string>;
}): Promise<boolean> {
  assertWriteProtectedPathEntries(writeProtectedPaths);
  if (paths.length === 0) return true;

  try {
    const canonicalWorkDir = await realpath(workDir);
    const protectedRoots = await Promise.all(
      writeProtectedPaths.map(entry =>
        resolveExistingPrefix(`${workDir}/${entry}`),
      ),
    );
    const protection = await collectWriteProtectedPaths({
      canonicalWorkDir,
      protectedRoots,
    });
    if (protection == null) return true;

    const targets: Array<{ path: string; isMultiLinkFile: boolean }> = [];
    for (const filePath of paths) {
      if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        return true;
      }
      if (!path.posix.isAbsolute(filePath) && !path.posix.isAbsolute(cwd)) {
        return true;
      }
      const absolutePath = path.posix.isAbsolute(filePath)
        ? filePath
        : `${cwd}/${filePath}`;
      /*
       * Native runtimes differ in whether they normalize parent components
       * before filesystem access, so both interpretations are checked. The
       * original components are kept for realpath because normalizing a
       * symlink followed by `..` first can change which file is accessed.
       */
      for (const candidatePath of new Set([
        absolutePath,
        path.posix.normalize(absolutePath),
      ])) {
        const target = await resolveExistingPrefix(candidatePath);
        const stats = protection.anyRootExists
          ? await lstatIfExists(target)
          : undefined;
        targets.push({
          path: target,
          isMultiLinkFile: stats?.isFile() === true && stats.nlink > 1,
        });
      }
    }

    return matchesWriteProtectedPath({
      targets,
      protectedPaths: [
        ...writeProtectedPaths.map(entry =>
          path.posix.join(canonicalWorkDir, entry),
        ),
        ...protection.paths,
      ],
      anyProtectedPathExists: protection.anyRootExists,
    });
  } catch {
    return true;
  }
}

/*
 * Collects the canonical protected roots plus the canonical targets of every
 * symlink inside existing protected directories, transitively for targets that
 * are directories inside the working directory. Symlinks are never descended
 * into; their targets are scanned instead. Targets outside the working
 * directory are not scanned because writes there already require approval.
 * Returns `undefined` when the scan exceeds its entry limit.
 */
async function collectWriteProtectedPaths({
  canonicalWorkDir,
  protectedRoots,
}: {
  canonicalWorkDir: string;
  protectedRoots: ReadonlyArray<string>;
}): Promise<{ paths: string[]; anyRootExists: boolean } | undefined> {
  const paths = [...protectedRoots];
  const queue: string[] = [];
  let anyRootExists = false;
  for (const root of protectedRoots) {
    const stats = await lstatIfExists(root);
    if (stats == null) continue;
    anyRootExists = true;
    if (stats.isDirectory()) queue.push(root);
  }

  const scanned = new Set<string>();
  let entryCount = 0;
  while (queue.length > 0) {
    const directory = queue.shift()!;
    if (scanned.has(directory)) continue;
    scanned.add(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      entryCount += 1;
      if (entryCount > WRITE_PROTECTION_SCAN_LIMIT) return undefined;
      const entryPath = path.posix.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(entryPath);
        paths.push(target);
        if (
          isInsideWriteProtectionPath({
            parent: canonicalWorkDir,
            candidate: target,
          }) &&
          (await lstat(target)).isDirectory()
        ) {
          queue.push(target);
        }
      } else if (entry.isDirectory()) {
        queue.push(entryPath);
      }
    }
  }
  return { paths, anyRootExists };
}

/*
 * Resolves the nearest existing ancestor for paths that do not exist yet. A
 * dangling symlink is an existing entry whose realpath fails, so it cannot be
 * resolved.
 */
async function resolveExistingPrefix(inputPath: string): Promise<string> {
  let existingPath = inputPath;
  const missingSegments: string[] = [];
  while ((await lstatIfExists(existingPath)) == null) {
    const parent = path.posix.dirname(existingPath);
    const segment = path.posix.basename(existingPath);
    if (parent === existingPath || segment === '..' || segment === '.') {
      throw new Error(`Unable to resolve path ${JSON.stringify(inputPath)}.`);
    }
    missingSegments.unshift(segment);
    existingPath = parent;
  }
  return path.posix.join(await realpath(existingPath), ...missingSegments);
}

async function lstatIfExists(entryPath: string): Promise<Stats | undefined> {
  try {
    return await lstat(entryPath);
  } catch (error) {
    if (
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
}
