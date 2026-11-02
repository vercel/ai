import { realpathSync } from 'node:fs';
import path from 'node:path';

/*
 * With project configuration disabled, OpenCode no longer discovers the
 * working directory's `AGENTS.md`, and resolves relative `instructions`
 * entries against its global config directory. Absolute entries still load,
 * render the same `Instructions from: <path>` block, and are re-read on every
 * model step, with missing files skipped. Returns `undefined` when the host
 * value is not a string array, so OpenCode reports its own validation error.
 * The working directory is resolved the same way OpenCode resolves its
 * instance directory, so the paths match the `Instructions from: <path>`
 * headers OpenCode renders for natively discovered files.
 */
export function resolveOpenCodeInstructions({
  workdir,
  hostInstructions,
}: {
  workdir: string;
  hostInstructions: unknown;
}): string[] | undefined {
  if (
    hostInstructions !== undefined &&
    !(
      Array.isArray(hostInstructions) &&
      hostInstructions.every(entry => typeof entry === 'string')
    )
  ) {
    return undefined;
  }
  const directory = resolveRealPath(workdir);
  return [
    path.join(directory, 'AGENTS.md'),
    ...((hostInstructions as string[] | undefined) ?? []).map(entry =>
      entry.startsWith('http://') ||
      entry.startsWith('https://') ||
      entry.startsWith('~/') ||
      path.isAbsolute(entry)
        ? entry
        : path.join(directory, entry),
    ),
  ];
}

function resolveRealPath(file: string): string {
  const resolved = path.resolve(file);
  try {
    return realpathSync(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolved;
    throw error;
  }
}
