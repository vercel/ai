import { isWriteProtectedPath } from '@ai-sdk/harness/bridge';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

/*
 * Workspace paths that hold OpenCode configuration or skills it discovers,
 * which can run code or change the agent's behavior in later sessions. Writes
 * to them always require host approval unless the permission mode is
 * `allow-all`.
 */
const OPENCODE_WRITE_PROTECTED_PATHS = [
  '.agents/skills',
  '.opencode',
  'opencode.json',
  'opencode.jsonc',
  '.claude/skills',
];

export type PermissionToolCall = {
  nativeName: string;
  input: Record<string, unknown>;
};

type OpenCodePermissionPathOptions = {
  action: string;
  resources: string[];
  metadata: Record<string, unknown> | undefined;
  toolCall: PermissionToolCall | undefined;
  workDir: string;
  readableSkillRoots: readonly string[];
};

export async function areOpenCodePermissionPathsTrusted(
  options: OpenCodePermissionPathOptions,
): Promise<boolean> {
  const resolved = resolveOpenCodePermissionTargets(options);
  if (resolved == null) return false;
  return areFileToolPathsTrusted({
    workDir: options.workDir,
    cwd: options.workDir,
    paths: resolved.targets,
    access: resolved.access,
    readableSkillRoots: options.readableSkillRoots,
  });
}

export async function areOpenCodePermissionPathsWriteProtected(
  options: OpenCodePermissionPathOptions,
): Promise<boolean> {
  const resolved = resolveOpenCodePermissionTargets(options);
  if (resolved == null) return true;
  if (resolved.access !== 'write') return false;
  return isWriteProtectedPath({
    workDir: options.workDir,
    paths: resolved.targets,
    writeProtectedPaths: OPENCODE_WRITE_PROTECTED_PATHS,
  });
}

export function resolveOpenCodePermissionTargets(
  options: OpenCodePermissionPathOptions,
): { access: 'read' | 'write'; targets: string[] } | undefined {
  const args = options.toolCall?.input;
  const nativeName = options.toolCall?.nativeName;
  const access =
    ['edit', 'write'].includes(options.action) ||
    ['write', 'edit', 'apply_patch'].includes(nativeName ?? '')
      ? 'write'
      : 'read';
  let targets: unknown[];
  if (Array.isArray(options.metadata?.files)) {
    if (options.metadata.files.length === 0) return undefined;
    targets = options.metadata.files.flatMap(value => {
      if (value == null || typeof value !== 'object') return [undefined];
      const file = value as Record<string, unknown>;
      return file.type === 'move' || file.movePath != null
        ? [file.filePath, file.movePath]
        : [file.filePath];
    });
  } else if (
    args &&
    ['read', 'view', 'write', 'edit'].includes(nativeName ?? '')
  ) {
    targets = [args.filePath];
  } else if (
    args &&
    ['glob', 'grep', 'list', 'ls'].includes(nativeName ?? '')
  ) {
    targets = [args.path ?? options.workDir];
  } else if (
    typeof options.metadata?.filepath === 'string' &&
    options.action !== 'edit'
  ) {
    targets = [options.metadata.filepath];
  } else if (
    options.action === 'edit' &&
    typeof options.metadata?.filepath === 'string' &&
    path.posix.isAbsolute(options.metadata.filepath)
  ) {
    targets = [options.metadata.filepath];
  } else if (
    options.action === 'read' &&
    options.resources.length > 0 &&
    options.resources.every(value => path.posix.isAbsolute(value))
  ) {
    targets = options.resources;
  } else {
    return undefined;
  }
  if (!targets.every((value): value is string => typeof value === 'string'))
    return undefined;
  return { access, targets };
}

export async function areFileToolPathsTrusted(options: {
  workDir: string;
  cwd: string;
  paths: readonly string[];
  access: 'read' | 'write';
  readableSkillRoots: readonly string[];
}): Promise<boolean> {
  if (options.paths.length === 0) return false;
  try {
    const roots = [await realpath(options.workDir)];
    if (options.access === 'read') {
      for (const root of options.readableSkillRoots) {
        try {
          roots.push(await realpath(root));
        } catch {
          continue;
        }
      }
    }
    for (const filePath of options.paths) {
      if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        return false;
      }
      if (
        !path.posix.isAbsolute(filePath) &&
        !path.posix.isAbsolute(options.cwd)
      ) {
        return false;
      }
      const absolutePath = path.posix.isAbsolute(filePath)
        ? filePath
        : `${options.cwd}/${filePath}`;
      /*
       * Native runtimes differ in whether they normalize parent components
       * before filesystem access. Both interpretations must stay within a
       * trusted root, including when a symlink precedes a parent component.
       */
      for (const candidatePath of [
        absolutePath,
        path.posix.normalize(absolutePath),
      ]) {
        const candidate = await resolvePermissionPath({
          filePath: candidatePath,
        });
        if (
          !roots.some(root => {
            const relative = path.posix.relative(root, candidate);
            return (
              relative === '' ||
              (relative !== '..' &&
                !relative.startsWith('../') &&
                !path.posix.isAbsolute(relative))
            );
          })
        )
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function resolvePermissionPath(options: {
  filePath: string;
}): Promise<string> {
  let existingPath = options.filePath;
  const missing: string[] = [];
  for (;;) {
    let exists = true;
    try {
      await lstat(existingPath);
    } catch (error) {
      if (
        error == null ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      )
        throw error;
      exists = false;
    }
    if (exists)
      return path.posix.join(await realpath(existingPath), ...missing);
    const parent = path.posix.dirname(existingPath);
    const segment = path.posix.basename(existingPath);
    if (parent === existingPath || segment === '.' || segment === '..') {
      throw new Error('Unable to resolve permission path.');
    }
    missing.unshift(segment);
    existingPath = parent;
  }
}
