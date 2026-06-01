import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';
import { shellQuote } from './pi-utils';

/*
 * Pi runs on the host with its working directory pointed at the local mirror,
 * but the only thing it reads from that directory is its own resource
 * configuration: the `.pi` directory (skills, prompts, themes, extensions) and
 * the root-level agent context files (`AGENTS.md` / `CLAUDE.md`). The model
 * never reads workspace source through the host — file reads, directory
 * listings, and greps all run as tools against the sandbox. Mirroring the whole
 * sandbox workspace to the host would therefore copy files Pi never looks at,
 * one `readBinaryFile` round-trip per file. For a real project that has been
 * cloned and had its dependencies installed (hundreds of thousands of files
 * under `node_modules`) that makes session startup take hours. The mirror is
 * consequently scoped to exactly the paths Pi's resource loader consults.
 */
const PI_CONFIG_DIR = '.pi';
const PI_CONTEXT_FILENAMES = [
  'AGENTS.md',
  'AGENTS.MD',
  'CLAUDE.md',
  'CLAUDE.MD',
] as const;

function normalizeRelativePath(inputPath: string): string {
  const normalized = inputPath.split(path.posix.sep).join(path.sep);
  const relative = path.normalize(normalized);
  if (
    relative === '' ||
    relative === '.' ||
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new Error(
      `Sandbox workspace mirror received an invalid relative path: ${inputPath}`,
    );
  }
  return relative;
}

async function readCommandOutput(
  sandbox: Experimental_Sandbox,
  command: string,
): Promise<string> {
  const result = await sandbox.run({ command });
  const output = result.stdout || result.stderr;
  if (result.exitCode != null && result.exitCode !== 0) {
    throw new Error(
      output || `Sandbox command failed with exit code ${result.exitCode}`,
    );
  }
  return output;
}

async function listRemoteWorkspaceEntries(
  sandbox: Experimental_Sandbox,
  remoteWorkDir: string,
): Promise<{ directories: string[]; files: string[] }> {
  const contextPredicate = PI_CONTEXT_FILENAMES.map(
    name => `-name ${shellQuote(name)}`,
  ).join(' -o ');

  // Enumerate only the `.pi` config subtree plus the root-level context files —
  // never the rest of the workspace. Entries are tagged `d`/`f` and NUL-joined
  // exactly like a full-tree walk so the reconcile below is unchanged.
  const listCommand = [
    '{',
    `  if [ -d ./${PI_CONFIG_DIR} ]; then find ./${PI_CONFIG_DIR} \\( -type d -o -type f \\) -print0; fi;`,
    `  find . -maxdepth 1 -type f \\( ${contextPredicate} \\) -print0;`,
    '} |',
    "while IFS= read -r -d '' entry; do",
    '  rel=${entry#./}',
    '  if [ -L "$entry" ]; then',
    '    continue',
    '  elif [ -d "$entry" ]; then',
    `    printf 'd\\t%s\\n' "$rel"`,
    '  elif [ -f "$entry" ]; then',
    `    printf 'f\\t%s\\n' "$rel"`,
    '  fi',
    'done | LC_ALL=C sort',
  ].join('\n');

  const output = await readCommandOutput(
    sandbox,
    [`cd ${shellQuote(remoteWorkDir)}`, listCommand].join(' && '),
  );

  const directories: string[] = [];
  const files: string[] = [];

  for (const line of output.split('\n').filter(Boolean)) {
    const [kind, rawPath] = line.split('\t', 2);
    if (!rawPath) continue;

    const relativePath = normalizeRelativePath(rawPath);
    if (kind === 'd') directories.push(relativePath);
    else if (kind === 'f') files.push(relativePath);
  }

  return { directories, files };
}

async function pathKind(
  target: string,
): Promise<'file' | 'directory' | undefined> {
  try {
    const stats = await stat(target);
    if (stats.isDirectory()) return 'directory';
    if (stats.isFile()) return 'file';
    return undefined;
  } catch {
    return undefined;
  }
}

async function collectLocalSubtree(
  rootDir: string,
  currentDir: string,
  directories: string[],
  files: string[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    if (entry.isDirectory()) {
      directories.push(relativePath);
      await collectLocalSubtree(rootDir, absolutePath, directories, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

/**
 * Enumerate the locally-mirrored entries that fall within Pi's scope: the
 * `.pi` config subtree and the root-level context files. Anything else on the
 * local side (it should not normally exist) is intentionally ignored so the
 * reconcile below neither copies nor deletes it.
 */
async function collectLocalScopedEntries(
  rootDir: string,
): Promise<{ directories: string[]; files: string[] }> {
  const directories: string[] = [];
  const files: string[] = [];

  const configDir = path.join(rootDir, PI_CONFIG_DIR);
  if ((await pathKind(configDir)) === 'directory') {
    directories.push(PI_CONFIG_DIR);
    await collectLocalSubtree(rootDir, configDir, directories, files);
  }

  for (const name of PI_CONTEXT_FILENAMES) {
    if ((await pathKind(path.join(rootDir, name))) === 'file') {
      files.push(name);
    }
  }

  return { directories, files };
}

function buildRequiredDirectories(
  remoteDirectories: string[],
  remoteFiles: string[],
): Set<string> {
  const directories = new Set<string>();
  for (const directory of remoteDirectories) {
    directories.add(normalizeRelativePath(directory));
  }
  for (const file of remoteFiles) {
    let current = path.dirname(normalizeRelativePath(file));
    while (current !== '.' && current !== path.sep && current.length > 0) {
      directories.add(current);
      current = path.dirname(current);
    }
  }
  return directories;
}

export async function syncLocalWorkspaceFromSandbox(args: {
  sandbox: Experimental_Sandbox;
  remoteWorkDir: string;
  localWorkDir: string;
}): Promise<void> {
  const { sandbox, remoteWorkDir, localWorkDir } = args;
  const remoteEntries = await listRemoteWorkspaceEntries(
    sandbox,
    remoteWorkDir,
  );
  const localEntries = await collectLocalScopedEntries(localWorkDir);
  const remoteFiles = new Set(remoteEntries.files);
  const requiredDirectories = buildRequiredDirectories(
    remoteEntries.directories,
    remoteEntries.files,
  );

  for (const relativePath of localEntries.files) {
    if (!remoteFiles.has(relativePath)) {
      await rm(path.join(localWorkDir, relativePath), { force: true });
    }
  }

  const removableDirectories = [...localEntries.directories]
    .filter(p => !requiredDirectories.has(p))
    .sort((a, b) => b.length - a.length);
  for (const relativePath of removableDirectories) {
    await rm(path.join(localWorkDir, relativePath), {
      recursive: true,
      force: true,
    });
  }

  for (const relativePath of [...requiredDirectories].sort(
    (a, b) => a.length - b.length,
  )) {
    await mkdir(path.join(localWorkDir, relativePath), { recursive: true });
  }

  for (const relativePath of remoteEntries.files) {
    const remotePath = path.posix.join(
      remoteWorkDir,
      relativePath.split(path.sep).join('/'),
    );
    const bytes = await sandbox.readBinaryFile({ path: remotePath });
    if (!bytes) {
      throw new Error(
        `Sandbox workspace file disappeared during mirror sync: ${remotePath}`,
      );
    }
    const content = Buffer.from(bytes);

    const localPath = path.join(localWorkDir, relativePath);
    let shouldWrite = true;
    try {
      const existing = await readFile(localPath);
      shouldWrite = !existing.equals(content);
    } catch {
      shouldWrite = true;
    }

    if (shouldWrite) {
      await mkdir(path.dirname(localPath), { recursive: true });
      await writeFile(localPath, content);
    }
  }
}

export async function writeLocalWorkspaceFile(
  localWorkDir: string,
  relativePath: string,
  content: Buffer,
): Promise<void> {
  const normalizedPath = normalizeRelativePath(relativePath);
  const localPath = path.join(localWorkDir, normalizedPath);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, content);
}
