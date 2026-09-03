import { createHash } from 'node:crypto';
import path from 'node:path';
import type { HarnessV1Skill } from '@ai-sdk/harness';
import { writeSkills, type WriteSkillsResult } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

const ACP_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DEFAULT_ACP_SKILLS_DIRECTORY = '.agents/skills';

export function resolveACPPrivateSessionDirectory({
  sandboxHomeDir,
  sessionWorkDir,
  harnessId,
  sessionId,
}: {
  sandboxHomeDir: string;
  sessionWorkDir: string;
  harnessId: string;
  sessionId: string;
}): string {
  const sessionKey = createHash('sha256').update(sessionId).digest('hex');
  const rootDir = path.posix.join(
    sandboxHomeDir,
    '.ai-sdk',
    'harness-acp',
    harnessId,
    sessionKey,
  );
  assertOutsideSessionWorkDir({ rootDir, sessionWorkDir });
  return rootDir;
}

export async function materializeACPSkills({
  sandbox,
  rootDir,
  sessionWorkDir,
  skills,
  abortSignal,
}: {
  sandbox: Experimental_SandboxSession;
  rootDir: string;
  sessionWorkDir: string;
  skills: ReadonlyArray<HarnessV1Skill>;
  abortSignal?: AbortSignal;
}): Promise<WriteSkillsResult> {
  validateACPSkills({ skills });
  assertOutsideSessionWorkDir({ rootDir, sessionWorkDir });

  return writeSkills({
    sandbox,
    rootDir,
    skills,
    abortSignal,
    skillNamePattern: ACP_SKILL_NAME_PATTERN,
    invalidSkillNameMessage: ({ name }) =>
      `Invalid ACP skill name ${JSON.stringify(name)}: expected a kebab-case slug.`,
    invalidSkillFilePathMessage: ({ skillName, filePath }) =>
      `Invalid ACP skill file path ${JSON.stringify(filePath)} for skill ${JSON.stringify(
        skillName,
      )}: expected a relative POSIX path without traversal.`,
  });
}

export function resolveACPSkillsDirectory({
  implementationHomeDir,
  skillsDirectory = DEFAULT_ACP_SKILLS_DIRECTORY,
  sessionWorkDir,
}: {
  implementationHomeDir: string;
  skillsDirectory?: string;
  sessionWorkDir: string;
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

  const rootDir = path.posix.join(implementationHomeDir, normalizedDirectory);
  assertOutsideSessionWorkDir({ rootDir, sessionWorkDir });
  return rootDir;
}

function validateACPSkills({
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

function assertOutsideSessionWorkDir({
  rootDir,
  sessionWorkDir,
}: {
  rootDir: string;
  sessionWorkDir: string;
}): void {
  const relative = path.posix.relative(sessionWorkDir, rootDir);
  const isInside =
    relative === '' ||
    (!relative.startsWith('../') && !path.posix.isAbsolute(relative));
  if (isInside) {
    throw new Error(
      `ACP skill directory ${JSON.stringify(rootDir)} must be outside sessionWorkDir ${JSON.stringify(
        sessionWorkDir,
      )}.`,
    );
  }
}
