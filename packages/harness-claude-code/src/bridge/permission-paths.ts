import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export async function areFileToolPathsTrusted(options: {
  workDir: string;
  cwd: string;
  paths: readonly string[];
  access: 'read' | 'write';
  readableSkillRoots: readonly string[];
  additionalDirectories?: readonly string[];
}): Promise<boolean> {
  if (options.paths.length === 0) return false;
  try {
    const roots = [await realpath(options.workDir)];
    /*
     * Additional directories are granted to Claude Code for reading and
     * writing, like the working directory. Only absolute paths are trusted so
     * a relative entry cannot widen trust relative to an unknown directory.
     */
    const trustedRoots = [
      ...(options.additionalDirectories ?? []).filter(root =>
        path.posix.isAbsolute(root),
      ),
      ...(options.access === 'read' ? options.readableSkillRoots : []),
    ];
    for (const root of trustedRoots) {
      try {
        roots.push(await realpath(root));
      } catch {
        continue;
      }
    }
    for (const filePath of options.paths) {
      /*
       * Grep and Glob trim paths and expand home-directory shorthand after
       * the approval hook. Require approval for these forms so a literal
       * workdir-relative path cannot authorize a different resolved path.
       */
      if (
        typeof filePath !== 'string' ||
        filePath.length === 0 ||
        filePath !== filePath.trim() ||
        filePath === '~' ||
        filePath.startsWith('~/')
      ) {
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
