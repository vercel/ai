import type { ToolCallUpdate } from '@agentclientprotocol/sdk';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

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
      if (
        canonicalPath == null ||
        !isInsidePath(canonicalWorkDir, canonicalPath)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    // Unresolvable locations require the host's approval.
    return false;
  }
}

async function resolvePermissionPath(
  inputPath: string,
): Promise<string | undefined> {
  let existingPath = inputPath;
  const missingSegments: string[] = [];
  for (;;) {
    try {
      await lstat(existingPath);
    } catch (error) {
      if (
        error == null ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
      const parent = path.posix.dirname(existingPath);
      const segment = path.posix.basename(existingPath);
      if (parent === existingPath || segment === '..' || segment === '.') {
        return undefined;
      }
      missingSegments.unshift(segment);
      existingPath = parent;
      continue;
    }

    // Resolve the nearest existing ancestor for new files. A dangling symlink
    // is an existing entry whose realpath fails, so it cannot be auto-approved.
    return path.posix.join(await realpath(existingPath), ...missingSegments);
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
