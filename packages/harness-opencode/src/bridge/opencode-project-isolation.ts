import { globSync, realpathSync } from 'node:fs';
import path from 'node:path';

const GLOB_CHARACTERS = /[*?[\]{}]/;

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
 *
 * OpenCode only treats the last segment of an absolute entry as a glob
 * pattern and uses the rest as a literal directory. Relative entries with
 * glob characters in a directory segment, such as a `**` segment, are
 * therefore expanded here into the matching files.
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
    ...((hostInstructions as string[] | undefined) ?? []).flatMap(entry => {
      if (
        entry.startsWith('http://') ||
        entry.startsWith('https://') ||
        entry.startsWith('~/') ||
        path.isAbsolute(entry)
      ) {
        return [entry];
      }
      if (!GLOB_CHARACTERS.test(path.dirname(entry))) {
        return [path.join(directory, entry)];
      }
      return globSync(entry, { cwd: directory, withFileTypes: true })
        .filter(match => match.isFile())
        .map(match => path.join(match.parentPath, match.name))
        .sort();
    }),
  ];
}

function resolveRealPath(file: string): string {
  const resolved = path.resolve(file);
  try {
    return realpathSync(resolved);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return resolved;
    }
    throw error;
  }
}
