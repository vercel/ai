import type { ToolCallUpdate } from '@agentclientprotocol/sdk';
import type { Stats } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

const ACP_WRITE_PROTECTION_SCAN_LIMIT = 2000;

export async function areACPToolLocationsTrusted({
  toolCall,
  workDir,
}: {
  toolCall: ToolCallUpdate;
  workDir: string;
}): Promise<boolean> {
  const locations = toolCall.locations;
  if (locations == null || locations.length === 0) {
    // File operations need explicit locations. Do not infer paths from an
    // agent-specific rawInput schema or a human-readable tool title.
    return toolCall.kind === 'think' || toolCall.kind === 'fetch';
  }

  try {
    const canonicalWorkDir = await realpath(workDir);
    for (const location of locations) {
      if (
        typeof location.path !== 'string' ||
        location.path.trim().length === 0
      ) {
        return false;
      }

      // Keep the original components for realpath: normalizing a symlink
      // followed by `..` first can change which file the agent will access.
      const canonicalPath = await resolvePermissionPath(
        path.posix.isAbsolute(location.path)
          ? location.path
          : `${workDir}/${location.path}`,
      );
      if (!isInsidePath(canonicalWorkDir, canonicalPath)) {
        return false;
      }
    }
    return true;
  } catch {
    // Unresolvable locations require the host's approval.
    return false;
  }
}

/*
 * Returns whether a write tool call touches a write-protected path and
 * therefore requires the host's approval. A location matches when its
 * canonical path is a protected path, lies inside one, or is a parent of one,
 * since moving or deleting a parent replaces the protected contents.
 *
 * Each configured path is protected both at its literal location below the
 * canonical working directory and at its canonical location. The literal
 * location covers parents of a protected path that is itself a symlink, whose
 * canonical location lies elsewhere.
 *
 * Protected paths are resolved on every call because the filesystem can change
 * during a session. Symlinks found inside protected directories protect their
 * targets as well, so files reachable through a protected path cannot be
 * written through an unprotected alias. Hard links are invisible to path
 * resolution, so while any protected path exists, writes to files with more
 * than one link require approval. Any resolution failure, including dangling
 * or looping symlinks, fails closed.
 */
export async function areACPToolWriteLocationsProtected({
  toolCall,
  workDir,
  writeProtectedPaths,
}: {
  toolCall: ToolCallUpdate;
  workDir: string;
  writeProtectedPaths: ReadonlyArray<string>;
}): Promise<boolean> {
  const locations = toolCall.locations;
  if (locations == null || locations.length === 0) return true;

  try {
    const canonicalWorkDir = await realpath(workDir);
    const protectedRoots = await Promise.all(
      writeProtectedPaths.map(entry =>
        resolvePermissionPath(`${workDir}/${entry}`),
      ),
    );
    const protection = await collectWriteProtectedPaths({
      canonicalWorkDir,
      protectedRoots,
    });
    if (protection == null) return true;
    const protectedPaths = [
      ...writeProtectedPaths.map(entry =>
        path.posix.join(canonicalWorkDir, entry),
      ),
      ...protection.paths,
    ];

    for (const location of locations) {
      if (
        typeof location.path !== 'string' ||
        location.path.trim().length === 0
      ) {
        return true;
      }
      const target = await resolvePermissionPath(
        path.posix.isAbsolute(location.path)
          ? location.path
          : `${workDir}/${location.path}`,
      );
      if (
        protectedPaths.some(
          protectedPath =>
            isInsidePath(protectedPath, target) ||
            isInsidePath(target, protectedPath),
        )
      ) {
        return true;
      }
      if (protection.anyRootExists) {
        const stats = await lstatIfExists(target);
        if (stats?.isFile() === true && stats.nlink > 1) return true;
      }
    }
    return false;
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
      if (entryCount > ACP_WRITE_PROTECTION_SCAN_LIMIT) return undefined;
      const entryPath = path.posix.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(entryPath);
        paths.push(target);
        if (
          isInsidePath(canonicalWorkDir, target) &&
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

// Resolves the nearest existing ancestor for new files. A dangling symlink is
// an existing entry whose realpath fails, so it cannot be auto-approved.
async function resolvePermissionPath(inputPath: string): Promise<string> {
  let existingPath = inputPath;
  const missingSegments: string[] = [];
  while (!(await entryExists(existingPath))) {
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

async function entryExists(entryPath: string): Promise<boolean> {
  try {
    await lstat(entryPath);
    return true;
  } catch (error) {
    if (
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false;
    }
    throw error;
  }
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

function isInsidePath(parent: string, candidate: string): boolean {
  const relative = path.posix.relative(parent, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith('../') &&
      !path.posix.isAbsolute(relative))
  );
}
