import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { shellQuote } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

/*
 * Pi runs on the host with its working directory pointed at the local mirror,
 * but the only thing it reads from that directory is its own resource
 * configuration: the `.pi` and `.agents` directories (skills, prompts, themes,
 * extensions) and the root-level agent context files (`AGENTS.md`). The model
 * never reads workspace source through the host — file reads, directory
 * listings, and greps all run as tools against the sandbox. Mirroring the whole
 * sandbox workspace to the host would therefore copy files Pi never looks at,
 * one `readBinaryFile` round-trip per file. For a real project that has been
 * cloned and had its dependencies installed (hundreds of thousands of files
 * under `node_modules`) that makes session startup take hours. The mirror is
 * consequently scoped to exactly the paths Pi's resource loader consults.
 *
 * Within those config directories, symlinks are resolved and their targets
 * copied as real files. `.agents/skills` is frequently a symlink to a `skills`
 * directory living elsewhere in the workspace; a mirrored symlink would dangle
 * because its target falls outside the scoped mirror, so the linked content is
 * walked and copied verbatim instead.
 */
const PI_CONFIG_DIRS = ['.pi', '.agents'] as const;
const PI_CONTEXT_FILENAMES = ['AGENTS.md', 'AGENTS.MD'] as const;

/*
 * The mirror runs on session start and again on every turn, so its cost must
 * not scale with the number of files in scope. Reading one file per
 * `readBinaryFile` call turns a `.agents/skills` tree of a few thousand
 * `SKILL.md` files into a few thousand sequential round trips per turn, which
 * exhausts the request budget of any sandbox whose filesystem calls are network
 * calls: the report behind this code saw `429 Rate limit exceeded` from a
 * MicroVM proxy long before a sync finished. Files are therefore transferred in
 * batches as a single gzipped tar archive per batch, which is one request for a
 * few hundred files instead of one request per file. Sandboxes without `tar`,
 * `gzip`, or `base64` fall back to per-file reads.
 */
export const ARCHIVE_BATCH_SIZE = 300;
const TAR_BLOCK_SIZE = 512;

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
  sandbox: Experimental_SandboxSession,
  command: string,
): Promise<string> {
  const result = await sandbox.run({ command });
  if (result.exitCode != null && result.exitCode !== 0) {
    throw new Error(
      result.stderr ||
        result.stdout ||
        `Sandbox command failed with exit code ${result.exitCode}`,
    );
  }
  return result.stdout || result.stderr;
}

async function listRemoteWorkspaceEntries(
  sandbox: Experimental_SandboxSession,
  sandboxWorkDir: string,
): Promise<{
  directories: string[];
  files: Array<{ relativePath: string; sandboxPath: string }>;
}> {
  // Enumerate only the `.pi`/`.agents` config subtrees plus the root-level
  // context files — never the rest of the workspace. Use shell glob traversal
  // instead of `find -L`, which is not supported by all sandbox shells.
  // Resolve each scoped root path component explicitly with `readlink`,
  // retaining both the scoped mirror path and the resolved sandbox path. Once
  // a root is resolved, queued descendants use physical parent paths and only
  // need resolution when the descendant itself is a symlink. This avoids
  // relying on shells that can inspect a symlinked directory but cannot
  // traverse paths below it, including when the symlink is an ancestor of the
  // sandbox work directory, without repeatedly resolving every component of
  // deep ordinary paths.
  const scopedPaths = [
    ...PI_CONFIG_DIRS.map(dir => `./${dir}`),
    ...PI_CONTEXT_FILENAMES.map(name => `./${name}`),
  ];
  const listCommand = [
    `pi_config_sources=(${scopedPaths
      .map(scopedPath =>
        shellQuote(path.posix.join(sandboxWorkDir, scopedPath.slice(2))),
      )
      .join(' ')})`,
    `pi_config_relatives=(${scopedPaths
      .map(scopedPath => shellQuote(scopedPath.slice(2)))
      .join(' ')})`,
    `pi_config_ancestors=(${scopedPaths.map(() => "''").join(' ')})`,
    `pi_config_resolve_ancestors=(${scopedPaths.map(() => '1').join(' ')})`,
    'pi_config_index=0',
    'while [ "$pi_config_index" -lt "${#pi_config_sources[@]}" ]; do',
    '  source=${pi_config_sources[$pi_config_index]}',
    '  relative=${pi_config_relatives[$pi_config_index]}',
    '  ancestors=${pi_config_ancestors[$pi_config_index]}',
    '  resolve_ancestors=${pi_config_resolve_ancestors[$pi_config_index]}',
    '  pi_config_index=$((pi_config_index + 1))',
    '  if [ "$resolve_ancestors" = 1 ] || [ -L "$source" ]; then',
    '    pending=$source',
    '    resolved=',
    '    seen_links=',
    '    case "$pending" in',
    '      /*) ;;',
    '      *) pending=$PWD/$pending ;;',
    '    esac',
    '    while [ -n "$pending" ]; do',
    '      pending=${pending#/}',
    '      [ -n "$pending" ] || break',
    '      component=${pending%%/*}',
    '      if [ "$pending" = "$component" ]; then',
    '        pending=',
    '      else',
    '        pending=${pending#*/}',
    '      fi',
    '      case "$component" in',
    '        ""|.) continue ;;',
    '        ..)',
    '          resolved=${resolved%/*}',
    '          continue',
    '          ;;',
    '      esac',
    '      candidate=$resolved/$component',
    '      if [ -L "$candidate" ]; then',
    '        case "$seen_links" in',
    '          *"',
    '"$candidate"',
    '"*)',
    `            printf 'Pi config traversal encountered a symlink cycle at %s\\n' "$candidate" >&2`,
    '            exit 1',
    '            ;;',
    '        esac',
    '        seen_links=$seen_links"',
    '"$candidate"',
    '"',
    '        target=$(readlink "$candidate") || exit $?',
    '        case "$target" in',
    '          /*) pending=$target${pending:+/$pending} ;;',
    '          *) pending=${candidate%/*}/$target${pending:+/$pending} ;;',
    '        esac',
    '        resolved=',
    '      else',
    '        resolved=$candidate',
    '      fi',
    '    done',
    '    if [ -z "$resolved" ]; then',
    `      printf 'Pi config traversal resolved %s to the filesystem root; skipping\\n' "$relative" >&2`,
    '      continue',
    '    fi',
    '    source=$resolved',
    '  fi',
    '  if [ -d "$source" ]; then',
    '    case "$ancestors" in',
    '      *"',
    '"$source"',
    '"*)',
    `        printf 'Pi config traversal encountered a symlink cycle at %s\\n' "$relative" >&2`,
    '        exit 1',
    '        ;;',
    '    esac',
    '    ancestors=$ancestors"',
    '"$source"',
    '"',
    `    printf 'd\\t%s\\n' "$relative"`,
    '    for child in "$source"/* "$source"/.[!.]* "$source"/..?*; do',
    '      if [ -L "$child" ] || [ -d "$child" ] || [ -f "$child" ]; then',
    '        child_name=${child##*/}',
    '        pi_config_sources+=("$child")',
    '        pi_config_relatives+=("$relative/$child_name")',
    '        pi_config_ancestors+=("$ancestors")',
    '        pi_config_resolve_ancestors+=(0)',
    '      fi',
    '    done',
    '  elif [ -f "$source" ]; then',
    `    printf 'f\\t%s\\t%s\\n' "$relative" "$source"`,
    '  fi',
    '  true',
    'done',
    'true',
  ].join('\n');

  const output = await readCommandOutput(
    sandbox,
    [`cd ${shellQuote(sandboxWorkDir)}`, listCommand].join(' && '),
  );

  const directories: string[] = [];
  const files: Array<{ relativePath: string; sandboxPath: string }> = [];

  for (const line of output.split('\n').filter(Boolean)) {
    const [kind, rawPath, sandboxPath] = line.split('\t', 3);
    if (!rawPath) continue;

    const relativePath = normalizeRelativePath(rawPath);
    if (kind === 'd') directories.push(relativePath);
    else if (kind === 'f' && sandboxPath) {
      files.push({ relativePath, sandboxPath });
    }
  }

  return { directories, files };
}

function readTarString(header: Buffer, offset: number, length: number): string {
  const field = header.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

/**
 * Extract the regular files from a ustar archive, keyed by member name.
 * Supports the `prefix` field, GNU long-name (`L`) entries, and pax (`x`)
 * `path` records, which is how the common tar implementations spell a member
 * path longer than 100 characters.
 */
function parseTarFiles(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let overrideName: string | undefined;
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= archive.length) {
    const header = archive.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every(byte => byte === 0)) break;

    const size = Number.parseInt(
      readTarString(header, 124, 12).trim() || '0',
      8,
    );
    const typeFlag = String.fromCharCode(header[156] as number);
    const dataStart = offset + TAR_BLOCK_SIZE;
    const data = archive.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;

    if (typeFlag === 'L') {
      overrideName = readTarString(data, 0, data.length);
      continue;
    }
    if (typeFlag === 'x' || typeFlag === 'X') {
      const pathRecord = data
        .toString('utf8')
        .split('\n')
        .map(record => /^\d+ path=(.*)$/.exec(record)?.[1])
        .find(value => value != null);
      if (pathRecord != null) overrideName = pathRecord;
      continue;
    }

    if (typeFlag === '0' || typeFlag === '\0') {
      const name = readTarString(header, 0, 100);
      const prefix = readTarString(header, 345, 155);
      files.set(
        overrideName ?? (prefix === '' ? name : `${prefix}/${name}`),
        Buffer.from(data),
      );
    }
    overrideName = undefined;
  }

  return files;
}

/**
 * Transfer a batch of sandbox files with a single command. Returns the decoded
 * contents keyed by the requested sandbox path, leaving out anything the
 * sandbox could not archive (no `tar`/`gzip`/`base64`, or a file that vanished
 * mid-sync) so the caller can fall back to a per-file read.
 */
async function readSandboxFilesAsArchive(
  sandbox: Experimental_SandboxSession,
  sandboxPaths: string[],
): Promise<Map<string, Buffer>> {
  // Archive relative to `/` so member names are the requested absolute paths
  // without their leading slash, wherever the files live: the traversal
  // resolves symlinks, so these paths can point outside the workspace.
  const members = sandboxPaths.map(sandboxPath =>
    sandboxPath.replace(/^\/+/, ''),
  );
  const command = `tar -C / -czf - -- ${members
    .map(shellQuote)
    .join(' ')} 2>/dev/null | base64`;

  let encoded: string;
  try {
    encoded = (await readCommandOutput(sandbox, command)).replace(/\s+/g, '');
  } catch {
    return new Map();
  }
  if (encoded === '') return new Map();

  let entries: Map<string, Buffer>;
  try {
    entries = parseTarFiles(gunzipSync(Buffer.from(encoded, 'base64')));
  } catch {
    return new Map();
  }

  const contents = new Map<string, Buffer>();
  for (const [index, member] of members.entries()) {
    const content = entries.get(member);
    if (content != null) {
      contents.set(sandboxPaths[index] as string, content);
    }
  }
  return contents;
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

async function collectHostSubtree(
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
      await collectHostSubtree(rootDir, absolutePath, directories, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

/**
 * Enumerate the locally-mirrored entries that fall within Pi's scope: the
 * `.pi`/`.agents` config subtrees and the root-level context files. Anything
 * else on the local side (it should not normally exist) is intentionally
 * ignored so the reconcile below neither copies nor deletes it.
 */
async function collectHostScopedEntries(
  rootDir: string,
): Promise<{ directories: string[]; files: string[] }> {
  const directories: string[] = [];
  const files: string[] = [];

  for (const dir of PI_CONFIG_DIRS) {
    const configDir = path.join(rootDir, dir);
    if ((await pathKind(configDir)) === 'directory') {
      directories.push(dir);
      await collectHostSubtree(rootDir, configDir, directories, files);
    }
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
  remoteFiles: Array<{ relativePath: string }>,
): Set<string> {
  const directories = new Set<string>();
  for (const directory of remoteDirectories) {
    directories.add(normalizeRelativePath(directory));
  }
  for (const file of remoteFiles) {
    let current = path.dirname(normalizeRelativePath(file.relativePath));
    while (current !== '.' && current !== path.sep && current.length > 0) {
      directories.add(current);
      current = path.dirname(current);
    }
  }
  return directories;
}

export async function syncHostWorkspaceFromSandbox(args: {
  sandbox: Experimental_SandboxSession;
  sandboxWorkDir: string;
  hostWorkDir: string;
}): Promise<void> {
  const { sandbox, sandboxWorkDir, hostWorkDir } = args;
  const remoteEntries = await listRemoteWorkspaceEntries(
    sandbox,
    sandboxWorkDir,
  );
  const hostEntries = await collectHostScopedEntries(hostWorkDir);
  const remoteFiles = new Set(
    remoteEntries.files.map(file => file.relativePath),
  );
  const requiredDirectories = buildRequiredDirectories(
    remoteEntries.directories,
    remoteEntries.files,
  );

  for (const relativePath of hostEntries.files) {
    if (!remoteFiles.has(relativePath)) {
      await rm(path.join(hostWorkDir, relativePath), { force: true });
    }
  }

  const removableDirectories = [...hostEntries.directories]
    .filter(p => !requiredDirectories.has(p))
    .sort((a, b) => b.length - a.length);
  for (const relativePath of removableDirectories) {
    await rm(path.join(hostWorkDir, relativePath), {
      recursive: true,
      force: true,
    });
  }

  for (const relativePath of [...requiredDirectories].sort(
    (a, b) => a.length - b.length,
  )) {
    await mkdir(path.join(hostWorkDir, relativePath), { recursive: true });
  }

  for (
    let offset = 0;
    offset < remoteEntries.files.length;
    offset += ARCHIVE_BATCH_SIZE
  ) {
    const batch = remoteEntries.files.slice(
      offset,
      offset + ARCHIVE_BATCH_SIZE,
    );
    const archived = await readSandboxFilesAsArchive(
      sandbox,
      batch.map(file => file.sandboxPath),
    );

    for (const { relativePath, sandboxPath } of batch) {
      let content = archived.get(sandboxPath);
      if (content == null) {
        const bytes = await sandbox.readBinaryFile({ path: sandboxPath });
        if (!bytes) {
          throw new Error(
            `Sandbox workspace file disappeared during mirror sync: ${sandboxPath}`,
          );
        }
        content = Buffer.from(bytes);
      }

      const hostPath = path.join(hostWorkDir, relativePath);
      let shouldWrite = true;
      try {
        const existing = await readFile(hostPath);
        shouldWrite = !existing.equals(content);
      } catch {
        shouldWrite = true;
      }

      if (shouldWrite) {
        await mkdir(path.dirname(hostPath), { recursive: true });
        await writeFile(hostPath, content);
      }
    }
  }
}

export async function writeHostWorkspaceFile(
  hostWorkDir: string,
  relativePath: string,
  content: Buffer,
): Promise<void> {
  const normalizedPath = normalizeRelativePath(relativePath);
  const hostPath = path.join(hostWorkDir, normalizedPath);
  await mkdir(path.dirname(hostPath), { recursive: true });
  await writeFile(hostPath, content);
}
