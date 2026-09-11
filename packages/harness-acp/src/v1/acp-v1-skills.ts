import { createHash } from 'node:crypto';
import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';

export const ACP_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DEFAULT_ACP_SKILLS_DIRECTORY = '.agents/skills';

export function resolveACPPrivateSessionDirectory({
  sandboxHomeDir,
  harnessId,
  sessionId,
}: {
  sandboxHomeDir: string;
  harnessId: string;
  sessionId: string;
}): string {
  const sessionKey = createHash('sha256').update(sessionId).digest('hex');
  return path.posix.join(
    sandboxHomeDir,
    '.ai-sdk',
    'harness-acp',
    harnessId,
    sessionKey,
  );
}

export function resolveACPSkillsDirectory({
  implementationHomeDir,
  skillsDirectory = DEFAULT_ACP_SKILLS_DIRECTORY,
}: {
  implementationHomeDir: string;
  skillsDirectory?: string;
}): string {
  const containsTraversal = skillsDirectory
    .split(/[\\/]/)
    .some(segment => segment === '..');
  const normalizedDirectory = path.posix.normalize(skillsDirectory);
  if (
    skillsDirectory.length === 0 ||
    skillsDirectory.includes('\\') ||
    path.posix.isAbsolute(skillsDirectory) ||
    path.win32.isAbsolute(skillsDirectory) ||
    containsTraversal ||
    normalizedDirectory === '.' ||
    normalizedDirectory.startsWith('../') ||
    normalizedDirectory.includes('/../') ||
    normalizedDirectory.endsWith('/..')
  ) {
    throw new Error(
      `ACP skillsDirectory ${JSON.stringify(skillsDirectory)} must be a relative POSIX path without traversal.`,
    );
  }

  return path.posix.join(implementationHomeDir, normalizedDirectory);
}

export function validateACPSkills({
  skills,
}: {
  skills: ReadonlyArray<HarnessV1Skill>;
}): void {
  const skillNames = new Set<string>();
  for (const skill of skills) {
    if (
      !ACP_SKILL_NAME_PATTERN.test(skill.name) ||
      skill.name === '.' ||
      skill.name === '..'
    ) {
      throw new Error(
        `Invalid ACP skill name ${JSON.stringify(skill.name)}: expected a kebab-case slug.`,
      );
    }
    if (skillNames.has(skill.name)) {
      throw new Error(
        `Duplicate ACP skill name ${JSON.stringify(skill.name)}.`,
      );
    }
    skillNames.add(skill.name);

    const filePaths = new Set<string>();
    for (const file of skill.files ?? []) {
      const normalizedPath = validateACPAttachedFilePath({
        skillName: skill.name,
        filePath: file.path,
      });
      if (normalizedPath === 'SKILL.md') {
        throw new Error(
          `Invalid ACP skill file path ${JSON.stringify(file.path)} for skill ${JSON.stringify(
            skill.name,
          )}: SKILL.md is reserved for the skill definition.`,
        );
      }
      if (filePaths.has(normalizedPath)) {
        throw new Error(
          `Duplicate ACP skill file path ${JSON.stringify(file.path)} for skill ${JSON.stringify(
            skill.name,
          )}.`,
        );
      }
      filePaths.add(normalizedPath);
    }
  }
}

function validateACPAttachedFilePath({
  skillName,
  filePath,
}: {
  skillName: string;
  filePath: string;
}): string {
  const containsTraversal = filePath
    .split(/[\\/]/)
    .some(segment => segment === '..');
  const normalizedPath = path.posix.normalize(filePath);
  const invalid =
    filePath.length === 0 ||
    filePath.endsWith('/') ||
    filePath.includes('\\') ||
    path.posix.isAbsolute(filePath) ||
    path.win32.isAbsolute(filePath) ||
    containsTraversal ||
    normalizedPath === '.' ||
    normalizedPath.startsWith('../') ||
    normalizedPath.includes('/../') ||
    normalizedPath.endsWith('/..');
  if (invalid) {
    throw new Error(
      `Invalid ACP skill file path ${JSON.stringify(filePath)} for skill ${JSON.stringify(
        skillName,
      )}: expected a relative POSIX path without traversal.`,
    );
  }
  return normalizedPath;
}
