import {
  createSyntheticSourceInfo,
  parseFrontmatter,
  type ResourceDiagnostic,
  type Skill,
  type SkillFrontmatter,
} from '@earendil-works/pi-coding-agent';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import path from 'node:path';

export async function loadPiRepositoryResources({
  sandbox,
  workDir,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  workDir: string;
  abortSignal?: AbortSignal;
}): Promise<{
  agentsFiles: Array<{ path: string; content: string }>;
  skills: Skill[];
  diagnostics: ResourceDiagnostic[];
}> {
  abortSignal?.throwIfAborted();
  const agentsPath = path.posix.join(workDir, 'AGENTS.md');
  const instructions = await sandbox.readTextFile({
    path: agentsPath,
    abortSignal,
  });
  const skills = new Map<string, Skill>();
  const diagnostics: ResourceDiagnostic[] = [];

  async function loadSkillsDirectory(directory: string): Promise<void> {
    abortSignal?.throwIfAborted();
    const entries = await sandbox.listDirectory({
      path: directory,
      abortSignal,
    });
    abortSignal?.throwIfAborted();
    if (entries == null) return;

    if (
      entries.some(entry => entry.name === 'SKILL.md' && entry.type === 'file')
    ) {
      const filePath = path.posix.join(directory, 'SKILL.md');
      const content = await sandbox.readTextFile({
        path: filePath,
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
