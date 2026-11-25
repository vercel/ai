import {
  createSyntheticSourceInfo,
  parseFrontmatter,
  type ResourceDiagnostic,
  type Skill,
  type SkillFrontmatter,
} from '@earendil-works/pi-coding-agent';
import type {
  Experimental_SandboxDirectoryEntry,
  Experimental_SandboxSession,
} from '@ai-sdk/provider-utils';
import path from 'node:path';
import { createPiPathMapper } from './pi-paths';
import {
  PiSandboxPathResolutionError,
  resolvePiSandboxPathOrParent,
} from './pi-remote-ops';

export async function loadPiRepositoryResources({
  sandbox,
  workDir,
  deniedRoots = [],
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  workDir: string;
  deniedRoots?: ReadonlyArray<string>;
  abortSignal?: AbortSignal;
}): Promise<{
  agentsFiles: Array<{ path: string; content: string }>;
  skills: Skill[];
  diagnostics: ResourceDiagnostic[];
}> {
  abortSignal?.throwIfAborted();
  let canonicalWorkDir: string;
  let canonicalDeniedRoots: string[];
  try {
    canonicalWorkDir = await resolvePiSandboxPathOrParent({
      sandbox,
      remotePath: workDir,
      inputPath: workDir,
      abortSignal,
    });
    canonicalDeniedRoots = await Promise.all(
      deniedRoots.map(deniedRoot =>
        resolvePiSandboxPathOrParent({
          sandbox,
          remotePath: path.posix.normalize(deniedRoot),
          inputPath: deniedRoot,
          abortSignal,
        }),
      ),
    );
  } catch (error) {
    if (error instanceof PiSandboxPathResolutionError) {
      return { agentsFiles: [], skills: [], diagnostics: [] };
    }
    throw error;
  }
  const paths = createPiPathMapper({
    sandboxWorkDir: workDir,
    readableRoots: [{ sandboxDir: canonicalWorkDir }],
    deniedRoots: [...deniedRoots, ...canonicalDeniedRoots],
  });

  async function resolveAllowedResourcePath(
    inputPath: string,
  ): Promise<string | null> {
    let remotePath: string;
    try {
      remotePath = paths.toReadableSandboxPath(inputPath);
    } catch {
      return null;
    }

    let canonicalPath: string;
    try {
      canonicalPath = await resolvePiSandboxPathOrParent({
        sandbox,
        remotePath,
        inputPath,
        abortSignal,
      });
    } catch (error) {
      if (error instanceof PiSandboxPathResolutionError) return null;
      throw error;
    }

    try {
      return paths.assertReadableSandboxPath(canonicalPath);
    } catch {
      return null;
    }
  }

  const agentsPath = path.posix.join(workDir, 'AGENTS.md');
  const resolvedAgentsPath = await resolveAllowedResourcePath(agentsPath);
  const instructions =
    resolvedAgentsPath == null
      ? null
      : await sandbox.readTextFile({
          path: resolvedAgentsPath,
          abortSignal,
        });
  const skills = new Map<string, Skill>();
  const diagnostics: ResourceDiagnostic[] = [];

  async function loadSkillsDirectory(directory: string): Promise<void> {
    abortSignal?.throwIfAborted();
    const resolvedDirectory = await resolveAllowedResourcePath(directory);
    if (resolvedDirectory == null) return;
    const entries: Experimental_SandboxDirectoryEntry[] | null =
      await sandbox.listDirectory({
        path: resolvedDirectory,
        abortSignal,
      });
    abortSignal?.throwIfAborted();
    if (entries == null) return;

    if (
      entries.some(entry => entry.name === 'SKILL.md' && entry.type === 'file')
    ) {
      const filePath = path.posix.join(directory, 'SKILL.md');
      const resolvedFilePath = await resolveAllowedResourcePath(filePath);
      if (resolvedFilePath == null) return;
      const content = await sandbox.readTextFile({
        path: resolvedFilePath,
        abortSignal,
      });
      abortSignal?.throwIfAborted();
      if (content == null) return;

      let frontmatter: SkillFrontmatter;
      try {
        ({ frontmatter } = parseFrontmatter<SkillFrontmatter>(content));
      } catch (error) {
        diagnostics.push({
          type: 'warning',
          message: error instanceof Error ? error.message : String(error),
          path: filePath,
        });
        return;
      }

      const description = frontmatter.description;
      if (typeof description !== 'string' || description.trim() === '') {
        diagnostics.push({
          type: 'warning',
          message: 'description is required',
          path: filePath,
        });
        return;
      }

      const name =
        (typeof frontmatter.name === 'string' && frontmatter.name) ||
        path.posix.basename(directory);
      const existing = skills.get(name);
      if (existing != null) {
        diagnostics.push({
          type: 'collision',
          message: `name "${name}" collision`,
          path: filePath,
          collision: {
            resourceType: 'skill',
            name,
            winnerPath: existing.filePath,
            loserPath: filePath,
          },
        });
        return;
      }

      skills.set(name, {
        name,
        description,
        filePath,
        baseDir: directory,
        sourceInfo: createSyntheticSourceInfo(filePath, {
          source: 'local',
          scope: 'project',
          baseDir: directory,
        }),
        disableModelInvocation:
          frontmatter['disable-model-invocation'] === true,
      });
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        entry.type === 'directory' &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules'
      ) {
        await loadSkillsDirectory(path.posix.join(directory, entry.name));
      }
    }
  }

  await loadSkillsDirectory(path.posix.join(workDir, '.agents', 'skills'));
  return {
    agentsFiles: instructions
      ? [{ path: agentsPath, content: instructions }]
      : [],
    skills: [...skills.values()],
    diagnostics,
  };
}
