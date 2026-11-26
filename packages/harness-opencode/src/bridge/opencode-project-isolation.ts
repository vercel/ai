import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  globSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  mirrorDir,
}: {
  workdir: string;
  hostInstructions: unknown;
  mirrorDir?: string;
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
  if (mirrorDir !== undefined) {
    return mirrorOpenCodeInstructions({
      workdir,
      hostInstructions: (hostInstructions as string[] | undefined) ?? [],
      mirrorDir,
    });
  }
  const directory = resolveRealPath(workdir);
  return [
    path.join(directory, 'AGENTS.md'),
    ...((hostInstructions as string[] | undefined) ?? []).flatMap(entry => {
      if (isExplicitHostInstruction(entry)) {
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

function isExplicitHostInstruction(entry: string): boolean {
  return (
    entry.startsWith('http://') ||
    entry.startsWith('https://') ||
    entry.startsWith('~/') ||
    path.isAbsolute(entry)
  );
}

/*
 * OpenCode follows symlinks in `instructions` on every model step without a
 * permission event, so in restrictive modes repository content must never be
 * handed to it as a path. Each repository instruction is read through a
 * containment check and copied into `mirrorDir`, which lies outside the
 * working directory, and only the mirror paths are configured. Host-supplied
 * absolute, `~/`, and URL entries are trusted application configuration and
 * pass through unchanged.
 */
function mirrorOpenCodeInstructions({
  workdir,
  hostInstructions,
  mirrorDir,
}: {
  workdir: string;
  hostInstructions: string[];
  mirrorDir: string;
}): string[] {
  mkdirSync(mirrorDir, { recursive: true, mode: 0o700 });
  const canonicalMirrorDir = realpathSync(mirrorDir);
  const canonicalWorkdir = resolveRealPath(workdir);

  const agentsMirrorPath = path.join(canonicalMirrorDir, 'AGENTS.md');
  syncMirrorFile({
    targetPath: agentsMirrorPath,
    content: readContainedWorkdirFile({
      canonicalWorkdir,
      candidatePath: path.join(canonicalWorkdir, 'AGENTS.md'),
    })?.content,
  });
  const keepTopLevelNames = new Set(['AGENTS.md']);
  const instructions = [agentsMirrorPath];

  hostInstructions.forEach((entry, index) => {
    if (isExplicitHostInstruction(entry)) {
      instructions.push(entry);
      return;
    }
    const slotName = `host-${index}`;
    const slotDir = path.join(canonicalMirrorDir, slotName);
    keepTopLevelNames.add(slotName);
    mkdirSync(slotDir, { recursive: true, mode: 0o700 });

    if (!GLOB_CHARACTERS.test(entry)) {
      const fileName = sanitizeMirrorFileName(path.basename(entry));
      pruneDirectoryEntries({
        directory: slotDir,
        keepNames: new Set([fileName]),
      });
      syncMirrorFile({
        targetPath: path.join(slotDir, fileName),
        content: readContainedWorkdirFile({
          canonicalWorkdir,
          candidatePath: path.resolve(canonicalWorkdir, entry),
        })?.content,
      });
      instructions.push(path.join(slotDir, fileName));
      return;
    }

    const keepSlotFiles = new Set<string>();
    const seenCanonicalPaths = new Set<string>();
    for (const match of globSafely({
      pattern: entry,
      cwd: canonicalWorkdir,
    }).sort()) {
      const file = readContainedWorkdirFile({
        canonicalWorkdir,
        candidatePath: path.resolve(canonicalWorkdir, match),
      });
      if (!file || seenCanonicalPaths.has(file.canonicalPath)) continue;
      seenCanonicalPaths.add(file.canonicalPath);
      const fileName = `${String(keepSlotFiles.size).padStart(4, '0')}-${sanitizeMirrorFileName(path.basename(match))}`;
      keepSlotFiles.add(fileName);
      writeMirrorFileAtomic({
        targetPath: path.join(slotDir, fileName),
        content: file.content,
      });
    }
    pruneDirectoryEntries({ directory: slotDir, keepNames: keepSlotFiles });
    instructions.push(path.join(slotDir, '*'));
  });

  pruneDirectoryEntries({
    directory: canonicalMirrorDir,
    keepNames: keepTopLevelNames,
  });
  return instructions;
}

function globSafely({
  pattern,
  cwd,
}: {
  pattern: string;
  cwd: string;
}): string[] {
  try {
    return globSync(pattern, { cwd });
  } catch {
    return [];
  }
}

/*
 * Returns `undefined` for anything that is not a regular file whose real path
 * lies strictly inside `canonicalWorkdir`. `O_NOFOLLOW` rejects a symlink that
 * appears between the path check and the open. The descriptor's device and
 * inode must then match the path that still resolves inside the working
 * directory, so the bytes come from the file that was checked.
 */
function readContainedWorkdirFile({
  canonicalWorkdir,
  candidatePath,
}: {
  canonicalWorkdir: string;
  candidatePath: string;
}): { canonicalPath: string; content: Buffer } | undefined {
  let canonicalTarget: string;
  try {
    canonicalTarget = realpathSync(candidatePath);
  } catch {
    return undefined;
  }
  if (
    !isStrictlyInsideDirectory({
      filePath: canonicalTarget,
      rootDir: canonicalWorkdir,
    })
  ) {
    return undefined;
  }

  let fd: number;
  try {
    fd = openSync(
      canonicalTarget,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
  } catch {
    return undefined;
  }
  try {
    const descriptorStat = fstatSync(fd);
    if (!descriptorStat.isFile()) return undefined;
    const verifiedPath = realpathSync(canonicalTarget);
    if (
      !isStrictlyInsideDirectory({
        filePath: verifiedPath,
        rootDir: canonicalWorkdir,
      })
    ) {
      return undefined;
    }
    const pathStat = lstatSync(verifiedPath);
    if (
      !pathStat.isFile() ||
      pathStat.dev !== descriptorStat.dev ||
      pathStat.ino !== descriptorStat.ino
    ) {
      return undefined;
    }
    return { canonicalPath: verifiedPath, content: readFileSync(fd) };
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

function isStrictlyInsideDirectory({
  filePath,
  rootDir,
}: {
  filePath: string;
  rootDir: string;
}): boolean {
  const relative = path.relative(rootDir, filePath);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function syncMirrorFile({
  targetPath,
  content,
}: {
  targetPath: string;
  content: Buffer | undefined;
}): void {
  if (content === undefined) {
    rmSync(targetPath, { recursive: true, force: true });
    return;
  }
  writeMirrorFileAtomic({ targetPath, content });
}

function writeMirrorFileAtomic({
  targetPath,
  content,
}: {
  targetPath: string;
  content: Buffer;
}): void {
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(tempPath, content, { mode: 0o600, flag: 'wx' });
    renameSync(tempPath, targetPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function pruneDirectoryEntries({
  directory,
  keepNames,
}: {
  directory: string;
  keepNames: ReadonlySet<string>;
}): void {
  for (const name of readdirSync(directory)) {
    if (!keepNames.has(name)) {
      rmSync(path.join(directory, name), { recursive: true, force: true });
    }
  }
}

function sanitizeMirrorFileName(name: string): string {
  return (
    name.replace(/[*?[\]{}\\/]/g, '_').replace(/^\.+/, '') || 'instruction.md'
  );
}
