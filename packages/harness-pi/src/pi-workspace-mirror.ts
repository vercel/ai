import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';
import { shellQuote } from './pi-utils';

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
  const listCommand = [
    "find . -path './.agent-bridge' -prune -o -mindepth 1 \\( -type d -o -type f \\) -print0 |",
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

async function collectLocalWorkspaceEntries(
  rootDir: string,
  currentDir = rootDir,
): Promise<{ directories: string[]; files: string[] }> {
  const directories: string[] = [];
  const files: string[] = [];
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    if (relativePath.length === 0) continue;

    // `.agent-bridge` is runtime-owned bridge state, not part of Pi's logical
    // workspace. Skip defensively so a stray local copy never gets treated as
    // user workspace state.
    if (relativePath === '.agent-bridge') continue;

    if (entry.isDirectory()) {
      directories.push(relativePath);
      const nested = await collectLocalWorkspaceEntries(rootDir, absolutePath);
      directories.push(...nested.directories);
      files.push(...nested.files);
      continue;
    }

    files.push(relativePath);
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
  const localEntries = await collectLocalWorkspaceEntries(localWorkDir);
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
